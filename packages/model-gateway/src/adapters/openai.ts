import type { GatewayFetch } from "../http";
import type { ModelGateway } from "../types";
import { OpenAICompatibleGateway } from "./openai-compatible";
import { OPENAI_PRICING_BY_MODEL } from "./openai-pricing";

export const OPENAI_BASE_URL = "https://api.openai.com/v1";

export type OpenAIGatewayOptions = {
  apiKey: string;
  fetch?: GatewayFetch;
  timeoutMs?: number;
  /** Defaults to cloud (public https endpoint). */
  deploymentMode?: "cloud" | "self_hosted";
};

/**
 * Thin OpenAI adapter: fixed `https://api.openai.com/v1`, published pricing table.
 * `baseUrl` is not accepted and cannot be overridden.
 */
export class OpenAIGateway implements ModelGateway {
  readonly provider = "openai" as const;
  private readonly inner: OpenAICompatibleGateway;

  constructor(options: OpenAIGatewayOptions) {
    const innerOptions: ConstructorParameters<typeof OpenAICompatibleGateway>[0] = {
      apiKey: options.apiKey,
      baseUrl: OPENAI_BASE_URL,
      deploymentMode: options.deploymentMode ?? "cloud",
      allowPrivateEndpoints: false,
      pricingByModel: OPENAI_PRICING_BY_MODEL,
      structuredOutput: "json_schema",
      reportedProvider: "openai",
    };
    if (options.fetch !== undefined) innerOptions.fetch = options.fetch;
    if (options.timeoutMs !== undefined) innerOptions.timeoutMs = options.timeoutMs;
    this.inner = new OpenAICompatibleGateway(innerOptions);
  }

  /** Exposed for tests: the locked API root. */
  get baseUrl(): string {
    return OPENAI_BASE_URL;
  }

  listModels = () => this.inner.listModels();
  getCapabilities = (modelId: string) => this.inner.getCapabilities(modelId);
  complete = (request: Parameters<ModelGateway["complete"]>[0]) => this.inner.complete(request);
  stream = (request: Parameters<ModelGateway["stream"]>[0]) => this.inner.stream(request);
  embed = (request: Parameters<ModelGateway["embed"]>[0]) => this.inner.embed(request);
  estimateCost = (modelId: string, inputTokens: number, outputTokens: number) =>
    this.inner.estimateCost(modelId, inputTokens, outputTokens);
}
