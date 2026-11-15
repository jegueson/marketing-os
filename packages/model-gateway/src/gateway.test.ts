import { describe, expect, it } from "vitest";
import { runGatewayContract } from "./contract";
import { FakeGateway } from "./fake";
import { ModelGatewayError } from "./errors";
import { estimateCostFromPricing } from "./pricing";
import type { ModelGateway } from "./types";

describe("estimateCostFromPricing", () => {
  it("returns null cost when pricing is unknown, never 0", () => {
    const unknown = estimateCostFromPricing(
      { inputPriceMicroUsdPer1M: null, outputPriceMicroUsdPer1M: null },
      1000,
      500,
    );
    expect(unknown.estimatedCostMicroUsd).toBeNull();
    expect(unknown.costBasis).toBe("unknown");
    expect(unknown.estimatedCostMicroUsd).not.toBe(0);
  });

  it("computes micro-USD from known per-1M prices", () => {
    const known = estimateCostFromPricing(
      { inputPriceMicroUsdPer1M: 1_000_000, outputPriceMicroUsdPer1M: 2_000_000 },
      1_000_000,
      500_000,
    );
    expect(known.estimatedCostMicroUsd).toBe(1_000_000 + 1_000_000);
    expect(known.costBasis).toBe("provider_list");
  });

  it("rejects negative or non-integer token counts", () => {
    const pricing = { inputPriceMicroUsdPer1M: 1000, outputPriceMicroUsdPer1M: 1000 };
    expect(() => estimateCostFromPricing(pricing, -1, 0)).toThrow(ModelGatewayError);
    expect(() => estimateCostFromPricing(pricing, 1.5, 0)).toThrow(ModelGatewayError);
    expect(() => estimateCostFromPricing(pricing, 0, Number.NaN)).toThrow(ModelGatewayError);
  });
});

describe("FakeGateway", () => {
  it("records calls and replays scripted complete output", async () => {
    const gateway = new FakeGateway({
      models: [
        {
          id: "fake/test",
          displayName: "Fake Test",
          provider: "openai_compatible",
          inputPriceMicroUsdPer1M: 1000,
          outputPriceMicroUsdPer1M: 2000,
        },
      ],
      completeScripts: [{ content: '{"intent":"answerable","steps":[]}' }],
    });

    const result = await gateway.complete({
      model: "fake/test",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.content).toContain("answerable");
    expect(gateway.calls.complete).toHaveLength(1);
    expect(gateway.calls.complete[0]?.messages[0]?.content).toBe("hi");
  });

  it("streams scripted deltas then done", async () => {
    const gateway = new FakeGateway({
      models: [
        {
          id: "fake/test",
          displayName: "Fake Test",
          provider: "openai_compatible",
          inputPriceMicroUsdPer1M: null,
          outputPriceMicroUsdPer1M: null,
        },
      ],
      streamScripts: [{ deltas: ["Hel", "lo"], finishReason: "stop" }],
    });

    const chunks: string[] = [];
    for await (const chunk of gateway.stream({
      model: "fake/test",
      messages: [{ role: "user", content: "hi" }],
    })) {
      if (chunk.type === "delta") chunks.push(chunk.text);
    }
    expect(chunks.join("")).toBe("Hello");
    expect(gateway.calls.stream).toHaveLength(1);
  });
});

describe("runGatewayContract", () => {
  it("passes a complete FakeGateway", async () => {
    const gateway = new FakeGateway({
      models: [
        {
          id: "fake/test",
          displayName: "Fake Test",
          provider: "openai_compatible",
          inputPriceMicroUsdPer1M: 1000,
          outputPriceMicroUsdPer1M: 2000,
        },
      ],
      completeScripts: [{ content: "ok" }],
      streamScripts: [{ deltas: ["ok"], finishReason: "stop" }],
      embedScripts: [{ embeddings: [[0.1, 0.2]] }],
    });
    await expect(runGatewayContract(gateway)).resolves.toBeUndefined();
  });

  it("fails an incomplete gateway missing methods", async () => {
    const incomplete = {
      provider: "openai_compatible",
      listModels: async () => [],
    } as unknown as ModelGateway;
    await expect(runGatewayContract(incomplete)).rejects.toThrow(/incomplete|missing|required/i);
  });

  it("requires unknown pricing to estimate as null not zero", async () => {
    const gateway = new FakeGateway({
      models: [
        {
          id: "fake/paid",
          displayName: "Priced first",
          provider: "openai_compatible",
          inputPriceMicroUsdPer1M: 1000,
          outputPriceMicroUsdPer1M: 2000,
        },
        {
          id: "fake/free",
          displayName: "Unknown price",
          provider: "openai_compatible",
          inputPriceMicroUsdPer1M: null,
          outputPriceMicroUsdPer1M: null,
        },
      ],
      completeScripts: [{ content: "ok" }],
      streamScripts: [{ deltas: ["ok"], finishReason: "stop" }],
      embedScripts: [{ embeddings: [[0.1]] }],
    });
    const cost = await gateway.estimateCost("fake/free", 100, 50);
    expect(cost.estimatedCostMicroUsd).toBeNull();
    await expect(runGatewayContract(gateway)).resolves.toBeUndefined();
  });

  it("rejects a gateway that returns 0 for unknown pricing", async () => {
    const bad: ModelGateway = {
      provider: "openai_compatible",
      async listModels() {
        return [
          {
            id: "a/priced",
            displayName: "Priced",
            provider: "openai_compatible",
            inputPriceMicroUsdPer1M: 1000,
            outputPriceMicroUsdPer1M: 1000,
          },
          {
            id: "b/unknown",
            displayName: "Unknown",
            provider: "openai_compatible",
            inputPriceMicroUsdPer1M: null,
            outputPriceMicroUsdPer1M: null,
          },
        ];
      },
      async getCapabilities() {
        return {
          structuredOutput: "json_object",
          contextWindow: 8_000,
          supportsTools: false,
          supportsStreaming: true,
          supportsEmbeddings: false,
        };
      },
      async complete() {
        return {
          id: "1",
          model: "a/priced",
          content: "ok",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      },
      async *stream() {
        yield { type: "delta" as const, text: "ok" };
        yield {
          type: "done" as const,
          usage: { inputTokens: 1, outputTokens: 1 },
          finishReason: "stop" as const,
        };
      },
      async embed() {
        throw new ModelGatewayError("unsupported", "unsupported_capability");
      },
      async estimateCost(modelId, inputTokens, outputTokens) {
        if (modelId === "b/unknown") {
          return {
            inputTokens,
            outputTokens,
            estimatedCostMicroUsd: 0,
            costBasis: "unknown",
          };
        }
        return {
          inputTokens,
          outputTokens,
          estimatedCostMicroUsd: 1,
          costBasis: "provider_list",
        };
      },
    };
    await expect(runGatewayContract(bad)).rejects.toThrow();
  });
});

describe("ModelGatewayError", () => {
  it("carries a typed code and never embeds a key in the message by convention", () => {
    const err = new ModelGatewayError("Provider rejected credentials", "auth_failed");
    expect(err.code).toBe("auth_failed");
    expect(err.message).not.toMatch(/sk-/);
  });
});
