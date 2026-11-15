import { describe, expect, it } from "vitest";
import { runGatewayContract } from "../contract";
import { OpenAIGateway, OPENAI_BASE_URL } from "./openai";
import { OPENAI_CHAT_MODEL, OPENAI_TEST_KEY, recordedOpenAIFetch } from "./openai.fixtures";
import { OPENAI_PRICING_BY_MODEL } from "./openai-pricing";

function gateway() {
  return new OpenAIGateway({ apiKey: OPENAI_TEST_KEY, fetch: recordedOpenAIFetch() });
}

describe("OpenAIGateway", () => {
  it("passes the contract kit against recorded fixtures", async () => {
    await expect(runGatewayContract(gateway())).resolves.toBeUndefined();
  });

  it("locks the base URL to api.openai.com and does not accept overrides", () => {
    const adapter = gateway();
    expect(adapter.baseUrl).toBe(OPENAI_BASE_URL);
    expect(adapter.provider).toBe("openai");
    // Options type has no baseUrl; runtime cast must still hit the fixed host.
    const sneaky = new OpenAIGateway({
      apiKey: OPENAI_TEST_KEY,
      fetch: recordedOpenAIFetch(),
      ...( { baseUrl: "https://evil.example/v1" } as object),
    } as ConstructorParameters<typeof OpenAIGateway>[0]);
    expect(sneaky.baseUrl).toBe(OPENAI_BASE_URL);
  });

  it("returns a non-null cost estimate for a known model", async () => {
    const cost = await gateway().estimateCost(OPENAI_CHAT_MODEL, 1_000_000, 500_000);
    const pricing = OPENAI_PRICING_BY_MODEL[OPENAI_CHAT_MODEL]!;
    expect(cost.estimatedCostMicroUsd).toBe(
      pricing.inputPriceMicroUsdPer1M! + Math.round(pricing.outputPriceMicroUsdPer1M! * 0.5),
    );
    expect(cost.costBasis).toBe("provider_list");
    expect(cost.estimatedCostMicroUsd).not.toBeNull();
  });

  it("lists models as provider openai", async () => {
    const models = await gateway().listModels();
    expect(models.every((m) => m.provider === "openai")).toBe(true);
    expect(models.find((m) => m.id === OPENAI_CHAT_MODEL)?.inputPriceMicroUsdPer1M).toBe(
      OPENAI_PRICING_BY_MODEL[OPENAI_CHAT_MODEL]!.inputPriceMicroUsdPer1M,
    );
  });
});
