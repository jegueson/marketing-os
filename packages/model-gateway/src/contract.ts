import { expect } from "vitest";
import {
  completeResponseSchema,
  costEstimateSchema,
  embedResponseSchema,
  modelCapabilitiesSchema,
  modelInfoSchema,
  streamChunkSchema,
  type ModelGateway,
} from "./types";

const REQUIRED_METHODS = [
  "listModels",
  "getCapabilities",
  "complete",
  "stream",
  "embed",
  "estimateCost",
] as const;

/**
 * Contract kit for ModelGateway adapters (test-only via `@marketing-os/model-gateway/contract`).
 * Incomplete fakes fail. Unknown pricing must estimate as null, never 0.
 */
export async function runGatewayContract(gateway: ModelGateway): Promise<void> {
  const methods = gateway as unknown as Record<string, unknown>;
  for (const method of REQUIRED_METHODS) {
    if (typeof methods[method] !== "function") {
      throw new Error(`Gateway is incomplete: missing required method ${method}`);
    }
  }

  const models = await gateway.listModels();
  expect(models.length).toBeGreaterThan(0);
  for (const model of models) {
    modelInfoSchema.parse(model);
  }

  for (const model of models) {
    const capabilities = modelCapabilitiesSchema.parse(await gateway.getCapabilities(model.id));
    expect(capabilities.contextWindow).toBeGreaterThan(0);

    const cost = costEstimateSchema.parse(await gateway.estimateCost(model.id, 100, 50));
    expect(cost.inputTokens).toBe(100);
    expect(cost.outputTokens).toBe(50);
    if (model.inputPriceMicroUsdPer1M === null || model.outputPriceMicroUsdPer1M === null) {
      expect(cost.estimatedCostMicroUsd).toBeNull();
      expect(cost.costBasis).toBe("unknown");
    } else {
      expect(cost.estimatedCostMicroUsd).not.toBeNull();
      expect(cost.costBasis).toBe("provider_list");
    }
  }

  const model = models[0]!;
  const capabilities = modelCapabilitiesSchema.parse(await gateway.getCapabilities(model.id));

  const complete = completeResponseSchema.parse(
    await gateway.complete({
      model: model.id,
      messages: [{ role: "user", content: "contract probe" }],
    }),
  );
  expect(complete.content.length).toBeGreaterThan(0);
  expect(complete.model).toBe(model.id);

  const chunks: unknown[] = [];
  for await (const chunk of gateway.stream({
    model: model.id,
    messages: [{ role: "user", content: "contract stream" }],
  })) {
    chunks.push(streamChunkSchema.parse(chunk));
  }
  expect(chunks.length).toBeGreaterThan(0);
  expect(chunks.some((c) => (c as { type: string }).type === "done")).toBe(true);

  if (capabilities.supportsEmbeddings) {
    const embedded = embedResponseSchema.parse(
      await gateway.embed({ model: model.id, input: "contract embed" }),
    );
    expect(embedded.embeddings.length).toBeGreaterThan(0);
  }
}
