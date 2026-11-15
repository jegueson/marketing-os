import { z } from "zod";

export const modelProviderSchema = z.enum([
  "openrouter",
  "openai_compatible",
  "openai",
  "anthropic",
]);

export type ModelProvider = z.infer<typeof modelProviderSchema>;

export const structuredOutputCapabilitySchema = z.enum(["json_schema", "json_object", "none"]);

export type StructuredOutputCapability = z.infer<typeof structuredOutputCapabilitySchema>;

export const modelCapabilitiesSchema = z
  .object({
    structuredOutput: structuredOutputCapabilitySchema,
    contextWindow: z.number().int().positive(),
    supportsTools: z.boolean(),
    supportsStreaming: z.boolean(),
    supportsEmbeddings: z.boolean(),
  })
  .strict();

export type ModelCapabilities = z.infer<typeof modelCapabilitiesSchema>;

export const modelInfoSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    displayName: z.string().trim().min(1).max(200),
    provider: modelProviderSchema,
    /** Micro-USD per 1M input tokens. Null when the provider does not publish a price. */
    inputPriceMicroUsdPer1M: z.number().nonnegative().nullable(),
    outputPriceMicroUsdPer1M: z.number().nonnegative().nullable(),
  })
  .strict();

export type ModelInfo = z.infer<typeof modelInfoSchema>;

export const chatMessageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().max(500_000),
  })
  .strict();

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const completeRequestSchema = z
  .object({
    model: z.string().trim().min(1).max(200),
    messages: z.array(chatMessageSchema).min(1).max(200),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().max(200_000).optional(),
    responseFormat: z
      .union([
        z.object({ type: z.literal("json_object") }).strict(),
        z
          .object({
            type: z.literal("json_schema"),
            name: z.string().trim().min(1).max(100),
            schema: z.unknown(),
          })
          .strict(),
      ])
      .optional(),
  })
  .strict();

export type CompleteRequest = z.infer<typeof completeRequestSchema> & {
  abortSignal?: AbortSignal | undefined;
};

export const tokenUsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  })
  .strict();

export type TokenUsage = z.infer<typeof tokenUsageSchema>;

export const completeResponseSchema = z
  .object({
    id: z.string().min(1).max(200),
    model: z.string().min(1).max(200),
    content: z.string(),
    finishReason: z.enum(["stop", "length", "content_filter", "error"]),
    usage: tokenUsageSchema,
    latencyMs: z.number().nonnegative(),
  })
  .strict();

export type CompleteResponse = z.infer<typeof completeResponseSchema>;

export const streamChunkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("delta"), text: z.string() }).strict(),
  z
    .object({
      type: z.literal("done"),
      usage: tokenUsageSchema,
      finishReason: z.enum(["stop", "length", "content_filter", "error"]),
    })
    .strict(),
]);

export type StreamChunk = z.infer<typeof streamChunkSchema>;

export const embedRequestSchema = z
  .object({
    model: z.string().trim().min(1).max(200),
    input: z.union([z.string().min(1), z.array(z.string().min(1)).min(1).max(100)]),
  })
  .strict();

export type EmbedRequest = z.infer<typeof embedRequestSchema> & {
  abortSignal?: AbortSignal | undefined;
};

export const embedResponseSchema = z
  .object({
    embeddings: z.array(z.array(z.number())).min(1),
    usage: z.object({ inputTokens: z.number().int().nonnegative() }).strict(),
    latencyMs: z.number().nonnegative(),
  })
  .strict();

export type EmbedResponse = z.infer<typeof embedResponseSchema>;

export const costEstimateSchema = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    /** Null when pricing is unknown. Never invent 0 for unknown. */
    estimatedCostMicroUsd: z.number().nonnegative().nullable(),
    costBasis: z.enum(["provider_list", "unknown"]),
  })
  .strict();

export type CostEstimate = z.infer<typeof costEstimateSchema>;

/**
 * Provider-neutral model gateway. Business logic never imports a vendor SDK.
 * Adapters use fetch only. Ledger and budgets wrap this interface (S3-T11/T12).
 */
export interface ModelGateway {
  readonly provider: ModelProvider;
  listModels(): Promise<ModelInfo[]>;
  getCapabilities(modelId: string): Promise<ModelCapabilities>;
  complete(request: CompleteRequest): Promise<CompleteResponse>;
  stream(request: CompleteRequest): AsyncIterable<StreamChunk>;
  embed(request: EmbedRequest): Promise<EmbedResponse>;
  estimateCost(modelId: string, inputTokens: number, outputTokens: number): Promise<CostEstimate>;
}
