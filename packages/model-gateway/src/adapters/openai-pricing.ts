import type { ModelPricing } from "../pricing";

/**
 * Published OpenAI list prices in micro-USD per 1M tokens.
 * Estimates for the usage ledger; provider invoices may differ.
 * Update when OpenAI changes public pricing.
 */
export const OPENAI_PRICING_BY_MODEL: Record<string, ModelPricing> = {
  "gpt-4o": {
    inputPriceMicroUsdPer1M: 2_500_000,
    outputPriceMicroUsdPer1M: 10_000_000,
  },
  "gpt-4o-mini": {
    inputPriceMicroUsdPer1M: 150_000,
    outputPriceMicroUsdPer1M: 600_000,
  },
  "gpt-4.1": {
    inputPriceMicroUsdPer1M: 2_000_000,
    outputPriceMicroUsdPer1M: 8_000_000,
  },
  "gpt-4.1-mini": {
    inputPriceMicroUsdPer1M: 400_000,
    outputPriceMicroUsdPer1M: 1_600_000,
  },
  "text-embedding-3-small": {
    inputPriceMicroUsdPer1M: 20_000,
    outputPriceMicroUsdPer1M: 0,
  },
  "text-embedding-3-large": {
    inputPriceMicroUsdPer1M: 130_000,
    outputPriceMicroUsdPer1M: 0,
  },
};
