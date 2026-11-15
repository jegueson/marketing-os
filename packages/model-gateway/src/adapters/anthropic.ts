import { ModelGatewayError } from "../errors";
import { gatewayFetch, mapHttpStatus, readJson, type GatewayFetch } from "../http";
import { estimateCostFromPricing } from "../pricing";
import { readSseData } from "../sse";
import type {
  ChatMessage,
  CompleteRequest,
  CompleteResponse,
  CostEstimate,
  EmbedRequest,
  EmbedResponse,
  ModelCapabilities,
  ModelGateway,
  ModelInfo,
  StreamChunk,
} from "../types";
import { ANTHROPIC_DEFAULT_MODELS, ANTHROPIC_PRICING_BY_MODEL } from "./anthropic-pricing";

export const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
export const ANTHROPIC_API_VERSION = "2023-06-01";

export type AnthropicGatewayOptions = {
  apiKey: string;
  fetch?: GatewayFetch;
  timeoutMs?: number;
  deploymentMode?: "cloud" | "self_hosted";
};

type AnthropicContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

type AnthropicMessage = {
  id?: string;
  model?: string;
  content?: AnthropicContent[];
  stop_reason?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
};

type StreamEvent = {
  type: string;
  message?: AnthropicMessage;
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    stop_reason?: string | null;
  };
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
};

function mapStopReason(raw: string | null | undefined): CompleteResponse["finishReason"] {
  if (raw === "max_tokens") return "length";
  if (raw === "refusal") return "content_filter";
  if (raw === "error") return "error";
  return "stop";
}

function splitSystem(messages: ChatMessage[]): { system?: string; messages: Array<{ role: "user" | "assistant"; content: string }> } {
  const systemParts: string[] = [];
  const rest: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
      continue;
    }
    rest.push({ role: message.role, content: message.content });
  }
  if (rest.length === 0) {
    throw new ModelGatewayError("Anthropic requires at least one non-system message", "invalid_request");
  }
  const result: { system?: string; messages: typeof rest } = { messages: rest };
  if (systemParts.length > 0) result.system = systemParts.join("\n\n");
  return result;
}

function extractText(content: AnthropicContent[] | undefined): string {
  if (!content) return "";
  const texts: string[] = [];
  for (const block of content) {
    if (block.type === "text") texts.push(block.text);
    if (block.type === "tool_use") texts.push(JSON.stringify(block.input));
  }
  return texts.join("");
}

function buildMessageBody(request: CompleteRequest, stream: boolean): Record<string, unknown> {
  const { system, messages } = splitSystem(request.messages);
  const body: Record<string, unknown> = {
    model: request.model,
    messages,
    max_tokens: request.maxTokens ?? 4096,
    stream,
  };
  if (system !== undefined) body.system = system;
  if (request.temperature !== undefined) {
    // Anthropic accepts 0–1 only; clamp to avoid provider 400s.
    body.temperature = Math.min(1, Math.max(0, request.temperature));
  }

  if (request.responseFormat?.type === "json_schema") {
    body.tools = [
      {
        name: "emit_result",
        description: "Emit the structured result for this request.",
        input_schema: request.responseFormat.schema,
      },
    ];
    body.tool_choice = { type: "tool", name: "emit_result" };
  } else if (request.responseFormat?.type === "json_object") {
    body.tools = [
      {
        name: "emit_result",
        description: "Emit a JSON object result.",
        input_schema: { type: "object", additionalProperties: true },
      },
    ];
    body.tool_choice = { type: "tool", name: "emit_result" };
  }

  return body;
}

/** Anthropic Messages API adapter. Fetch only; no vendor SDK. Embeddings unsupported. */
export class AnthropicGateway implements ModelGateway {
  readonly provider = "anthropic" as const;
  private readonly apiKey: string;
  private readonly fetchImpl: GatewayFetch;
  private readonly timeoutMs: number;
  private readonly deploymentMode: "cloud" | "self_hosted";
  private modelCache: ModelInfo[] | null = null;

  constructor(options: AnthropicGatewayOptions) {
    if (!options.apiKey.trim()) {
      throw new ModelGatewayError("Anthropic API key is required", "invalid_request");
    }
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.deploymentMode = options.deploymentMode ?? "cloud";
  }

  get baseUrl(): string {
    return ANTHROPIC_BASE_URL;
  }

  async listModels(): Promise<ModelInfo[]> {
    if (this.modelCache) return this.modelCache.map((m) => ({ ...m }));
    try {
      const { response, release } = await gatewayFetch(this.fetchImpl, `${ANTHROPIC_BASE_URL}/models?limit=1000`, {
        apiKey: this.apiKey,
        authStyle: "x-api-key",
        timeoutMs: this.timeoutMs,
        holdUntilRelease: true,
        endpointGuard: { deploymentMode: this.deploymentMode, allowPrivateEndpoints: false },
        headers: { "anthropic-version": ANTHROPIC_API_VERSION },
      });
      try {
        const payload = await readJson<{ data?: Array<{ id: string; display_name?: string }> }>(
          response,
          this.apiKey,
        );
        const models = (payload.data ?? [])
          .filter((m) => m.id)
          .map((m) => this.toModelInfo(m.id, m.display_name));
        if (models.length > 0) {
          this.modelCache = models;
          return models.map((m) => ({ ...m }));
        }
      } finally {
        release();
      }
    } catch (err) {
      // Fall through to the static catalog when /models is unavailable.
      // Auth and quota failures must still surface.
      if (
        err instanceof ModelGatewayError &&
        (err.code === "auth_failed" ||
          err.code === "rate_limited" ||
          err.code === "budget_exceeded" ||
          err.code === "invalid_request")
      ) {
        throw err;
      }
    }
    // Do not cache the static fallback — a transient /models failure must not
    // permanently hide live catalog entries on later calls.
    return ANTHROPIC_DEFAULT_MODELS.map((id) => this.toModelInfo(id));
  }

  async getCapabilities(modelId: string): Promise<ModelCapabilities> {
    await this.requireModel(modelId);
    return {
      structuredOutput: "json_schema",
      contextWindow: 200_000,
      supportsTools: true,
      supportsStreaming: true,
      supportsEmbeddings: false,
    };
  }

  async complete(request: CompleteRequest): Promise<CompleteResponse> {
    const started = Date.now();
    const { response, release } = await this.postMessages(buildMessageBody(request, false), request.abortSignal);
    try {
      const payload = await readJson<AnthropicMessage>(response, this.apiKey);
      if (payload.error) {
        throw mapHttpStatus(400, payload.error.message ?? "Provider error", this.apiKey);
      }
      return {
        id: payload.id ?? "anthropic-complete",
        model: payload.model ?? request.model,
        content: extractText(payload.content),
        finishReason: mapStopReason(payload.stop_reason),
        usage: {
          inputTokens: payload.usage?.input_tokens ?? 0,
          outputTokens: payload.usage?.output_tokens ?? 0,
        },
        latencyMs: Date.now() - started,
      };
    } finally {
      release();
    }
  }

  async *stream(request: CompleteRequest): AsyncIterable<StreamChunk> {
    const { response, signal, release } = await this.postMessages(
      buildMessageBody(request, true),
      request.abortSignal,
      this.timeoutMs * 2,
    );
    try {
      if (!response.body) {
        throw new ModelGatewayError("Streaming response had no body", "provider_unavailable");
      }
      let usage = { inputTokens: 0, outputTokens: 0 };
      let finishReason: CompleteResponse["finishReason"] = "stop";
      let sawStop = false;
      let sawDelta = false;
      for await (const payload of readSseData(response.body, { signal })) {
        let event: StreamEvent;
        try {
          event = JSON.parse(payload) as StreamEvent;
        } catch {
          continue; // Anthropic also sends event: lines; data payloads are JSON
        }
        if (event.error) {
          const status =
            event.error.type === "overloaded_error"
              ? 529
              : event.error.type === "rate_limit_error"
                ? 429
                : event.error.type === "api_error"
                  ? 500
                  : 400;
          throw mapHttpStatus(status, event.error.message ?? "Stream error", this.apiKey);
        }
        if (event.type === "message_start" && event.message?.usage) {
          usage = {
            inputTokens: event.message.usage.input_tokens ?? 0,
            outputTokens: event.message.usage.output_tokens ?? 0,
          };
        }
        if (event.type === "content_block_delta" && event.delta) {
          if (event.delta.type === "text_delta" && event.delta.text) {
            sawDelta = true;
            yield { type: "delta", text: event.delta.text };
          } else if (event.delta.type === "input_json_delta" && event.delta.partial_json) {
            // Forced tool_use streams JSON fragments; surface as text deltas.
            sawDelta = true;
            yield { type: "delta", text: event.delta.partial_json };
          }
        }
        if (event.type === "message_delta") {
          if (event.delta?.stop_reason) finishReason = mapStopReason(event.delta.stop_reason);
          if (event.usage?.output_tokens !== undefined) {
            usage = { ...usage, outputTokens: event.usage.output_tokens };
          }
          if (event.usage?.input_tokens !== undefined) {
            usage = { ...usage, inputTokens: event.usage.input_tokens };
          }
        }
        if (event.type === "message_stop") sawStop = true;
      }
      if (!sawStop && !sawDelta) {
        throw new ModelGatewayError("Stream ended without data", "provider_unavailable", true);
      }
      if (!sawStop) {
        throw new ModelGatewayError("Stream truncated before completion", "provider_unavailable", true);
      }
      yield { type: "done", usage, finishReason };
    } finally {
      release();
    }
  }

  async embed(_request: EmbedRequest): Promise<EmbedResponse> {
    throw new ModelGatewayError("Anthropic does not support embeddings", "unsupported_capability");
  }

  async estimateCost(modelId: string, inputTokens: number, outputTokens: number): Promise<CostEstimate> {
    await this.requireModel(modelId);
    const pricing = ANTHROPIC_PRICING_BY_MODEL[modelId] ?? {
      inputPriceMicroUsdPer1M: null,
      outputPriceMicroUsdPer1M: null,
    };
    return estimateCostFromPricing(pricing, inputTokens, outputTokens);
  }

  private toModelInfo(id: string, displayName?: string): ModelInfo {
    const pricing = ANTHROPIC_PRICING_BY_MODEL[id] ?? {
      inputPriceMicroUsdPer1M: null,
      outputPriceMicroUsdPer1M: null,
    };
    return {
      id,
      displayName: displayName?.trim() || id,
      provider: "anthropic",
      inputPriceMicroUsdPer1M: pricing.inputPriceMicroUsdPer1M,
      outputPriceMicroUsdPer1M: pricing.outputPriceMicroUsdPer1M,
    };
  }

  private async requireModel(modelId: string): Promise<ModelInfo> {
    const models = await this.listModels();
    const model = models.find((m) => m.id === modelId);
    if (!model) {
      // Allow known pricing catalog even if /models omitted it.
      if (ANTHROPIC_PRICING_BY_MODEL[modelId]) return this.toModelInfo(modelId);
      throw new ModelGatewayError(`Unknown model: ${modelId}`, "model_not_found");
    }
    return model;
  }

  private async postMessages(
    body: Record<string, unknown>,
    signal?: AbortSignal | undefined,
    timeoutMs = this.timeoutMs,
  ) {
    return gatewayFetch(this.fetchImpl, `${ANTHROPIC_BASE_URL}/messages`, {
      method: "POST",
      apiKey: this.apiKey,
      authStyle: "x-api-key",
      timeoutMs,
      signal,
      holdUntilRelease: true,
      endpointGuard: { deploymentMode: this.deploymentMode, allowPrivateEndpoints: false },
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify(body),
    });
  }
}
