import type { EndpointGuardOptions } from "../endpoint-guard";
import { ModelGatewayError } from "../errors";
import { gatewayFetch, mapProviderErrorCode, readJson, type GatewayFetch } from "../http";
import type { GatewayLogContext } from "../log";
import { estimateCostFromPricing, type ModelPricing } from "../pricing";
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
  ModelProvider,
  StreamChunk,
  StructuredOutputCapability,
} from "../types";

export type OpenAICompatibleGatewayOptions = {
  apiKey: string;
  baseUrl: string;
  fetch?: GatewayFetch;
  timeoutMs?: number;
  deploymentMode: EndpointGuardOptions["deploymentMode"];
  allowPrivateEndpoints?: boolean;
  /** Optional known pricing keyed by model id. Unknown models stay null. */
  pricingByModel?: Record<string, ModelPricing>;
  /** Override structured-output capability when the server cannot do JSON schema. */
  structuredOutput?: StructuredOutputCapability;
  /** Reported provider id (default openai_compatible). OpenAI adapter sets `openai`. */
  reportedProvider?: ModelProvider;
  /** Honored only when `deploymentMode` is not `cloud`. Set from `MOS_MODEL_DEBUG=1`. */
  modelDebug?: boolean;
};

type CompatModel = { id: string; owned_by?: string };
type ModelsResponse = { data?: CompatModel[] };
type ProviderError = { message?: string; code?: number | string; type?: string };

type CompletePayload = {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string | null;
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

function mapFinishReason(raw: string | null | undefined): CompleteResponse["finishReason"] {
  if (raw === "length") return "length";
  if (raw === "content_filter") return "content_filter";
  if (raw === "error") return "error";
  return "stop";
}

function isEmbedModel(id: string): boolean {
  return /embed/i.test(id);
}

function throwProviderError(error: ProviderError, apiKey: string): never {
  const code = typeof error.code === "number" ? error.code : 502;
  throw mapProviderErrorCode(code, error.message ?? "Provider error", apiKey);
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
  if (stream) body.stream_options = { include_usage: true };
  return body;
}

/**
 * Generic OpenAI-compatible HTTP adapter (Ollama, LM Studio, vLLM, …).
 * Validates baseUrl against the endpoint guard before every call.
 */
export class OpenAICompatibleGateway implements ModelGateway {
  readonly provider: ModelProvider;
  private readonly apiKey: string;
  private readonly fetchImpl: GatewayFetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly guard: EndpointGuardOptions;
  private readonly pricingByModel: Record<string, ModelPricing>;
  private readonly structuredOutput: StructuredOutputCapability;
  private readonly logContext: GatewayLogContext;
  private modelCache: CompatModel[] | null = null;

  constructor(options: OpenAICompatibleGatewayOptions) {
    if (!options.baseUrl.trim()) {
      throw new ModelGatewayError("baseUrl is required", "invalid_request");
    }
    this.provider = options.reportedProvider ?? "openai_compatible";
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? fetch;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.guard = {
      deploymentMode: options.deploymentMode,
      allowPrivateEndpoints: options.allowPrivateEndpoints === true,
    };
    this.pricingByModel = options.pricingByModel ?? {};
    this.structuredOutput = options.structuredOutput ?? "json_object";
    this.logContext = {
      provider: this.provider,
      deploymentMode: options.deploymentMode,
      modelDebug: options.modelDebug === true,
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    const models = await this.loadModels();
    return models.map((m) => this.toModelInfo(m.id));
  }

  async getCapabilities(modelId: string): Promise<ModelCapabilities> {
    await this.requireModel(modelId);
    const embed = isEmbedModel(modelId);
    return {
      structuredOutput: embed ? "none" : this.structuredOutput,
      contextWindow: 8_192,
      supportsTools: false,
      supportsStreaming: !embed,
      supportsEmbeddings: embed,
    };
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
      if (!payload.usage) {
        throw new ModelGatewayError("Provider returned no usage", "provider_unavailable", true);
      }
      return {
        id: payload.id ?? "compat-complete",
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
    await this.requireModel(modelId);
    const pricing = this.pricingByModel[modelId] ?? {
      inputPriceMicroUsdPer1M: null,
      outputPriceMicroUsdPer1M: null,
    };
    return estimateCostFromPricing(pricing, inputTokens, outputTokens);
  }

  private toModelInfo(id: string): ModelInfo {
    const pricing = this.pricingByModel[id] ?? {
      inputPriceMicroUsdPer1M: null,
      outputPriceMicroUsdPer1M: null,
    };
    return {
      id,
      displayName: id,
      provider: this.provider,
      inputPriceMicroUsdPer1M: pricing.inputPriceMicroUsdPer1M,
      outputPriceMicroUsdPer1M: pricing.outputPriceMicroUsdPer1M,
    };
  }

  private async loadModels(): Promise<CompatModel[]> {
    if (this.modelCache) return this.modelCache;
    const { response, release } = await gatewayFetch(this.fetchImpl, `${this.baseUrl}/models`, {
      apiKey: this.apiKey,
      timeoutMs: this.timeoutMs,
      holdUntilRelease: true,
      endpointGuard: this.guard,
      log: this.logContext,
    });
    try {
      const payload = await readJson<ModelsResponse>(response, this.apiKey);
      const models = payload.data ?? [];
      if (models.length === 0) {
        throw new ModelGatewayError("Provider returned no models", "provider_unavailable");
      }
      this.modelCache = models;
      return models;
    } finally {
      release();
    }
  }

  private async requireModel(modelId: string): Promise<CompatModel> {
    const models = await this.loadModels();
    const model = models.find((m) => m.id === modelId);
    if (!model) {
      throw new ModelGatewayError(`Unknown model: ${modelId}`, "model_not_found");
    }
    return model;
  }

  private async postJson(
    path: string,
    body: Record<string, unknown>,
    signal?: AbortSignal | undefined,
    timeoutMs = this.timeoutMs,
  ) {
    return gatewayFetch(this.fetchImpl, `${this.baseUrl}${path}`, {
      method: "POST",
      apiKey: this.apiKey,
      timeoutMs,
      signal,
      holdUntilRelease: true,
      endpointGuard: this.guard,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      log: this.logContext,
    });
  }
}
