import type { ModelPricing } from "../pricing";

/**
 * Published Anthropic list prices in micro-USD per 1M tokens.
 * Estimates for the usage ledger; provider invoices may differ.
 */
export const ANTHROPIC_PRICING_BY_MODEL: Record<string, ModelPricing> = {
  "claude-sonnet-4-20250514": {
    inputPriceMicroUsdPer1M: 3_000_000,
    outputPriceMicroUsdPer1M: 15_000_000,
  },
  "claude-3-5-sonnet-20241022": {
    inputPriceMicroUsdPer1M: 3_000_000,
    outputPriceMicroUsdPer1M: 15_000_000,
  },
  "claude-3-5-haiku-20241022": {
    inputPriceMicroUsdPer1M: 800_000,
    outputPriceMicroUsdPer1M: 4_000_000,
  },
  "claude-3-haiku-20240307": {
    inputPriceMicroUsdPer1M: 250_000,
    outputPriceMicroUsdPer1M: 1_250_000,
  },
};

/** Models the adapter advertises when /v1/models is unavailable. */
export const ANTHROPIC_DEFAULT_MODELS = Object.keys(ANTHROPIC_PRICING_BY_MODEL);
