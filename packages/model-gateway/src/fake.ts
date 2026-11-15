import { ModelGatewayError } from "./errors";
import { estimateCostFromPricing } from "./pricing";
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
} from "./types";

export type FakeCompleteScript = {
  content: string;
  finishReason?: CompleteResponse["finishReason"];
  usage?: CompleteResponse["usage"];
};

export type FakeStreamScript = {
  deltas: string[];
  finishReason?: "stop" | "length" | "content_filter" | "error";
  usage?: { inputTokens: number; outputTokens: number };
};

export type FakeEmbedScript = {
  embeddings: number[][];
  inputTokens?: number;
};

export type FakeGatewayOptions = {
  models: ModelInfo[];
  capabilities?: Partial<ModelCapabilities>;
  completeScripts?: FakeCompleteScript[];
  streamScripts?: FakeStreamScript[];
  embedScripts?: FakeEmbedScript[];
};

export type FakeGatewayCalls = {
  listModels: number;
  getCapabilities: string[];
  complete: CompleteRequest[];
  stream: CompleteRequest[];
  embed: EmbedRequest[];
  estimateCost: Array<{ modelId: string; inputTokens: number; outputTokens: number }>;
};

const defaultCapabilities: ModelCapabilities = {
  structuredOutput: "json_schema",
  contextWindow: 128_000,
  supportsTools: false,
  supportsStreaming: true,
  supportsEmbeddings: true,
};

function nextScript<T>(scripts: T[] | undefined, label: string): T {
  if (!scripts || scripts.length === 0) {
    throw new ModelGatewayError(`FakeGateway has no ${label} script`, "invalid_request");
  }
  return scripts.shift()!;
}

/** Scripted gateway for Ask pipeline tests. Records every call. */
export class FakeGateway implements ModelGateway {
  readonly provider = "openai_compatible" as const;
  readonly calls: FakeGatewayCalls = {
    listModels: 0,
    getCapabilities: [],
    complete: [],
    stream: [],
    embed: [],
    estimateCost: [],
  };

  private readonly models: ModelInfo[];
  private readonly capabilities: ModelCapabilities;
  private completeScripts: FakeCompleteScript[];
  private streamScripts: FakeStreamScript[];
  private embedScripts: FakeEmbedScript[];

  constructor(options: FakeGatewayOptions) {
    this.models = options.models.map((m) => ({ ...m }));
    this.capabilities = { ...defaultCapabilities, ...options.capabilities };
    this.completeScripts = [...(options.completeScripts ?? [])];
    this.streamScripts = [...(options.streamScripts ?? [])];
    this.embedScripts = [...(options.embedScripts ?? [])];
  }

  async listModels(): Promise<ModelInfo[]> {
    this.calls.listModels += 1;
    return this.models.map((m) => ({ ...m }));
  }

  async getCapabilities(modelId: string): Promise<ModelCapabilities> {
    this.calls.getCapabilities.push(modelId);
    this.requireModel(modelId);
    return { ...this.capabilities };
  }

  async complete(request: CompleteRequest): Promise<CompleteResponse> {
    this.calls.complete.push(cloneRequest(request));
    this.requireModel(request.model);
    const script = nextScript(this.completeScripts, "complete");
    return {
      id: `fake-complete-${this.calls.complete.length}`,
      model: request.model,
      content: script.content,
      finishReason: script.finishReason ?? "stop",
      usage: script.usage ?? { inputTokens: 10, outputTokens: 20 },
      latencyMs: 1,
    };
  }

  async *stream(request: CompleteRequest): AsyncIterable<StreamChunk> {
    this.calls.stream.push(cloneRequest(request));
    this.requireModel(request.model);
    const script = nextScript(this.streamScripts, "stream");
    for (const text of script.deltas) {
      yield { type: "delta", text };
    }
    yield {
      type: "done",
      usage: script.usage ?? { inputTokens: 10, outputTokens: 20 },
      finishReason: script.finishReason ?? "stop",
    };
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    this.calls.embed.push({ ...request, input: Array.isArray(request.input) ? [...request.input] : request.input });
    this.requireModel(request.model);
    if (!this.capabilities.supportsEmbeddings) {
      throw new ModelGatewayError("Embeddings are not supported", "unsupported_capability");
    }
    const script = nextScript(this.embedScripts, "embed");
    return {
      embeddings: script.embeddings.map((row) => [...row]),
      usage: { inputTokens: script.inputTokens ?? 8 },
      latencyMs: 1,
    };
  }

  async estimateCost(modelId: string, inputTokens: number, outputTokens: number): Promise<CostEstimate> {
    this.calls.estimateCost.push({ modelId, inputTokens, outputTokens });
    const model = this.requireModel(modelId);
    return estimateCostFromPricing(model, inputTokens, outputTokens);
  }

  private requireModel(modelId: string): ModelInfo {
    const model = this.models.find((m) => m.id === modelId);
    if (!model) {
      throw new ModelGatewayError(`Unknown model: ${modelId}`, "model_not_found");
    }
    return model;
  }
}

function cloneRequest(request: CompleteRequest): CompleteRequest {
  const messages: ChatMessage[] = request.messages.map((m) => ({ ...m }));
  const cloned: CompleteRequest = {
    model: request.model,
    messages,
  };
  if (request.temperature !== undefined) cloned.temperature = request.temperature;
  if (request.maxTokens !== undefined) cloned.maxTokens = request.maxTokens;
  if (request.responseFormat !== undefined) cloned.responseFormat = request.responseFormat;
  return cloned;
}
