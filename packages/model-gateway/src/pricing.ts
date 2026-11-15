import { ModelGatewayError } from "./errors";
import type { CostEstimate } from "./types";

export type ModelPricing = {
  inputPriceMicroUsdPer1M: number | null;
  outputPriceMicroUsdPer1M: number | null;
};

function assertTokenCount(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new ModelGatewayError(`${label} must be a non-negative integer`, "invalid_request");
  }
}

/**
 * Estimate cost in micro-USD from published per-1M prices.
 * Unknown pricing returns `estimatedCostMicroUsd: null` — never 0.
 */
export function estimateCostFromPricing(
  pricing: ModelPricing,
  inputTokens: number,
  outputTokens: number,
): CostEstimate {
  assertTokenCount(inputTokens, "inputTokens");
  assertTokenCount(outputTokens, "outputTokens");
  const { inputPriceMicroUsdPer1M, outputPriceMicroUsdPer1M } = pricing;
  if (inputPriceMicroUsdPer1M === null || outputPriceMicroUsdPer1M === null) {
    return {
      inputTokens,
      outputTokens,
      estimatedCostMicroUsd: null,
      costBasis: "unknown",
    };
  }
  const inputCost = (inputTokens * inputPriceMicroUsdPer1M) / 1_000_000;
  const outputCost = (outputTokens * outputPriceMicroUsdPer1M) / 1_000_000;
  return {
    inputTokens,
    outputTokens,
    estimatedCostMicroUsd: Math.round(inputCost + outputCost),
    costBasis: "provider_list",
  };
}
