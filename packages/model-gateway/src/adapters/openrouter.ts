import { ModelGatewayError } from "../errors";
import { gatewayFetch, mapProviderErrorCode, readJson, type GatewayFetch } from "../http";
import { estimateCostFromPricing } from "../pricing";
import { readSseData } from "../sse";
import type {
  CompleteRequest,
  CompleteResponse,
  CostEstimate,
  EmbedRequest,
  EmbedResponse,
  ModelCapabilities,
  ModelGateway,
  ModelInfo,
  StreamChunk,
  StructuredOutputCapability,
} from "../types";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export type OpenRouterGatewayOptions = {
  apiKey: string;
  fetch?: GatewayFetch;
  baseUrl?: string;
  timeoutMs?: number;
  /** Optional OpenRouter app attribution headers. */
  referer?: string;
  title?: string;
};

type OpenRouterModel = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  supported_parameters?: string[];
};

type ModelsResponse = { data?: OpenRouterModel[] };

type ProviderError = { message?: string; code?: number };

type CompletePayload = {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string | null;
    error?: ProviderError;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: ProviderError;
};

type StreamPayload = {
  error?: ProviderError;
  choices?: Array<{
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

type EmbedPayload = {
  data?: Array<{ embedding?: number[]; index?: number }>;
  usage?: { prompt_tokens?: number };
};

function priceToMicroUsdPer1M(raw: string | undefined): number | null {
  if (raw === undefined || raw === "") return null;
  const perToken = Number(raw);
  if (!Number.isFinite(perToken) || perToken < 0) return null;
  return Math.round(perToken * 1_000_000 * 1_000_000);
}

function mapFinishReason(raw: string | null | undefined): CompleteResponse["finishReason"] {
  if (raw === "length") return "length";
  if (raw === "content_filter") return "content_filter";
  if (raw === "error") return "error";
  return "stop";
}

function toModelInfo(model: OpenRouterModel): ModelInfo {
  return {
    id: model.id,
    displayName: model.name?.trim() || model.id,
    provider: "openrouter",
    inputPriceMicroUsdPer1M: priceToMicroUsdPer1M(model.pricing?.prompt),
    outputPriceMicroUsdPer1M: priceToMicroUsdPer1M(model.pricing?.completion),
  };
}

function capabilitiesFor(model: OpenRouterModel): ModelCapabilities {
  const outputs = model.architecture?.output_modalities ?? [];
  const supportsEmbeddings = outputs.includes("embeddings") || model.id.includes("embedding");
  const params = new Set(model.supported_parameters ?? []);
  let structuredOutput: StructuredOutputCapability = "none";
  if (params.has("structured_outputs") || params.has("response_format")) {
    structuredOutput = params.has("structured_outputs") ? "json_schema" : "json_object";
  } else if (!supportsEmbeddings) {
    structuredOutput = "json_object";
  }
  return {
    structuredOutput,
    contextWindow: model.context_length && model.context_length > 0 ? model.context_length : 8_192,
    supportsTools: params.has("tools"),
    supportsStreaming: !supportsEmbeddings,
    supportsEmbeddings,
  };
}

function buildChatBody(request: CompleteRequest, stream: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    messages: request.messages,
    stream,
  };
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
  if (request.responseFormat) {
    if (request.responseFormat.type === "json_object") {
      body.response_format = { type: "json_object" };
    } else {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: request.responseFormat.name,
          schema: request.responseFormat.schema,
          strict: true,
        },
      };
    }
  }
  if (stream) {
    body.stream_options = { include_usage: true };
  }
  return body;
}

function throwProviderError(error: ProviderError, apiKey: string): never {
  const status = typeof error.code === "number" ? error.code : 502;
  throw mapProviderErrorCode(status, error.message ?? "Provider error", apiKey);
}

/** OpenRouter adapter. Fetch only; no vendor SDK. */
export class OpenRouterGateway implements ModelGateway {
  readonly provider = "openrouter" as const;
  private readonly apiKey: string;
  private readonly fetchImpl: GatewayFetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly referer: string | undefined;
  private readonly title: string | undefined;
  private modelCache: OpenRouterModel[] | null = null;

  constructor(options: OpenRouterGatewayOptions) {
    if (!options.apiKey.trim()) {
      throw new ModelGatewayError("OpenRouter API key is required", "invalid_request");
    }
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? fetch;
    this.baseUrl = (options.baseUrl ?? OPENROUTER_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.referer = options.referer;
    this.title = options.title;
  }

  async listModels(): Promise<ModelInfo[]> {
    const models = await this.loadModels();
    return models.map(toModelInfo);
  }

  async getCapabilities(modelId: string): Promise<ModelCapabilities> {
    const model = await this.requireRawModel(modelId);
    return capabilitiesFor(model);
  }

  async complete(request: CompleteRequest): Promise<CompleteResponse> {
    const started = Date.now();
    const { response, release } = await this.postJson(
      "/chat/completions",
      buildChatBody(request, false),
      request.abortSignal,
    );
    try {
      const payload = await readJson<CompletePayload>(response, this.apiKey);
      if (payload.error) throwProviderError(payload.error, this.apiKey);
      const choice = payload.choices?.[0];
      if (!choice) {
        throw new ModelGatewayError("Provider returned no choices", "provider_unavailable", true);
      }
      if (choice.error) throwProviderError(choice.error, this.apiKey);
      if (!payload.usage) {
        throw new ModelGatewayError("Provider returned no usage", "provider_unavailable", true);
      }
      return {
        id: payload.id ?? "openrouter-complete",
        model: payload.model ?? request.model,
        content: choice.message?.content ?? "",
        finishReason: mapFinishReason(choice.finish_reason),
        usage: {
          inputTokens: payload.usage.prompt_tokens ?? 0,
          outputTokens: payload.usage.completion_tokens ?? 0,
        },
        latencyMs: Date.now() - started,
      };
    } finally {
      release();
    }
  }

  async *stream(request: CompleteRequest): AsyncIterable<StreamChunk> {
    const { response, signal, release } = await this.postJson(
      "/chat/completions",
      buildChatBody(request, true),
      request.abortSignal,
      this.timeoutMs * 2,
      true,
    );
    try {
      if (!response.body) {
        throw new ModelGatewayError("Streaming response had no body", "provider_unavailable");
      }
      let usage = { inputTokens: 0, outputTokens: 0 };
      let finishReason: CompleteResponse["finishReason"] = "stop";
      let sawDone = false;
      let sawFinish = false;
      let sawDelta = false;
      for await (const payload of readSseData(response.body, {
        signal,
        onDone: () => {
          sawDone = true;
        },
      })) {
        let chunk: StreamPayload;
        try {
          chunk = JSON.parse(payload) as StreamPayload;
        } catch {
          throw new ModelGatewayError("Provider returned invalid stream JSON", "provider_unavailable", true);
        }
        if (chunk.error) throwProviderError(chunk.error, this.apiKey);
        const choice = chunk.choices?.[0];
        const text = choice?.delta?.content;
        if (text) {
          sawDelta = true;
          yield { type: "delta", text };
        }
        if (choice?.finish_reason) {
          sawFinish = true;
          finishReason = mapFinishReason(choice.finish_reason);
        }
        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
          };
        }
      }
      if (!sawDone && !sawFinish && !sawDelta) {
        throw new ModelGatewayError("Stream ended without data", "provider_unavailable", true);
      }
      if (!sawDone && !sawFinish) {
        throw new ModelGatewayError("Stream truncated before completion", "provider_unavailable", true);
      }
      yield { type: "done", usage, finishReason };
    } finally {
      release();
    }
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    const caps = await this.getCapabilities(request.model);
    if (!caps.supportsEmbeddings) {
      throw new ModelGatewayError("Model does not support embeddings", "unsupported_capability");
    }
    const started = Date.now();
    const inputs = Array.isArray(request.input) ? request.input : [request.input];
    const { response, release } = await this.postJson(
      "/embeddings",
      { model: request.model, input: request.input },
      request.abortSignal,
    );
    try {
      const payload = await readJson<EmbedPayload>(response, this.apiKey);
      const embeddings = (payload.data ?? [])
        .slice()
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .map((row) => row.embedding ?? []);
      if (embeddings.length !== inputs.length || embeddings.some((row) => row.length === 0)) {
        throw new ModelGatewayError("Embedding response was incomplete", "provider_unavailable");
      }
      return {
        embeddings,
        usage: { inputTokens: payload.usage?.prompt_tokens ?? 0 },
        latencyMs: Date.now() - started,
      };
    } finally {
      release();
    }
  }

  async estimateCost(modelId: string, inputTokens: number, outputTokens: number): Promise<CostEstimate> {
    const model = toModelInfo(await this.requireRawModel(modelId));
    return estimateCostFromPricing(model, inputTokens, outputTokens);
  }

  private async loadModels(): Promise<OpenRouterModel[]> {
    if (this.modelCache) return this.modelCache;
    const { response, release } = await gatewayFetch(this.fetchImpl, `${this.baseUrl}/models`, {
      apiKey: this.apiKey,
      timeoutMs: this.timeoutMs,
      headers: this.extraHeaders(),
      holdUntilRelease: true,
    });
    try {
      const payload = await readJson<ModelsResponse>(response, this.apiKey);
      const models = payload.data ?? [];
      if (models.length === 0) {
        throw new ModelGatewayError("OpenRouter returned no models", "provider_unavailable");
      }
      this.modelCache = models;
      return models;
    } finally {
      release();
    }
  }

  private async requireRawModel(modelId: string): Promise<OpenRouterModel> {
    const models = await this.loadModels();
    const model = models.find((m) => m.id === modelId);
    if (!model) {
      throw new ModelGatewayError(`Unknown model: ${modelId}`, "model_not_found");
    }
    return model;
  }

  private extraHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.referer) headers["HTTP-Referer"] = this.referer;
    if (this.title) headers["X-Title"] = this.title;
    return headers;
  }

  private async postJson(
    path: string,
    body: Record<string, unknown>,
    signal?: AbortSignal | undefined,
    timeoutMs = this.timeoutMs,
    holdUntilRelease = true,
  ) {
    return gatewayFetch(this.fetchImpl, `${this.baseUrl}${path}`, {
      method: "POST",
      apiKey: this.apiKey,
      timeoutMs,
      signal,
      holdUntilRelease,
      headers: {
        "Content-Type": "application/json",
        ...this.extraHeaders(),
      },
      body: JSON.stringify(body),
    });
  }
}
