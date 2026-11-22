import { describe, expect, it } from "vitest";
import { FakeGateway } from "@marketing-os/model-gateway";
import { answerStage, verifyAnswerText, AnswerVerificationError } from "./answer";
import { buildEvidence } from "./evidence";

const evidence = buildEvidence(
  [
    {
      stepId: "spend",
      tool: "metric_value",
      status: "ok",
      value: 2550,
      unit: "EUR",
      definitionKey: "mock.spend",
      definitionVersion: "1",
      source: "mock",
      fetchedAt: "2026-04-01T15:00:00.000Z",
    },
  ],
  {
    workspaceId: "00000000-0000-4000-8000-000000000010",
    preset: "last_30_days",
    from: "2026-03-02",
    to: "2026-04-01",
    labels: { "mock.spend": "Spend" },
  },
);

const model = {
  id: "gpt-test",
  displayName: "GPT Test",
  provider: "openai_compatible" as const,
  inputPriceMicroUsdPer1M: 1,
  outputPriceMicroUsdPer1M: 1,
};

function gateway(scripts: string[]) {
  return new FakeGateway({
    models: [model],
    completeScripts: scripts.map((content) => ({ content })),
  });
}

function draft(interpretation: string, observations: string[] = ["Spend was {{o1}}."]) {
  return JSON.stringify({ observations, interpretation });
}

function numbersIn(text: string): string[] {
  return text.match(/\d+(?:\.\d+)?/g) ?? [];
}

describe("answer verifier", () => {
  it("rejects a bare percentage", () => {
    expect(() => verifyAnswerText("Spend rose 42%.", evidence)).toThrow(AnswerVerificationError);
    expect(() => verifyAnswerText("Spend rose 42%.", evidence)).toThrow(/bare number 42%/);
  });

  it("rejects an unknown ref", () => {
    expect(() => verifyAnswerText("See {{missing}}.", evidence)).toThrow(/unknown ref missing/);
  });
});

describe("answerStage", () => {
  it("fills observation lines from observed facts only", async () => {
    const fake = gateway([draft("Within the selected range.")]);
    const result = await answerStage(fake, { question: "How much did we spend?", evidence, model: model.id });
    expect(result.promptName).toBe("ask.answer");
    expect(result.promptVersion).toBe("1");
    expect(result.fallback).toBe(false);
    expect(result.answer.observations).toEqual(["Spend: 2550"]);
    expect(result.answer.interpretation).toBe("Within the selected range.");
    expect(numbersIn(JSON.stringify(result.answer.observations))).toEqual(["2550"]);
    expect(fake.calls.complete[0]?.messages[1]?.content).toContain("o1 Spend");
    expect(fake.calls.complete[0]?.messages[1]?.content).not.toContain("2550");
  });

  it("retries a bare number once and falls back without that number", async () => {
    const repaired = gateway([draft("Spend rose 42%."), draft("Within the selected range.")]);
    const ok = await answerStage(repaired, { question: "How much did we spend?", evidence, model: model.id });
    expect(ok.repaired).toBe(true);
    expect(ok.fallback).toBe(false);
    expect(JSON.stringify(ok.answer)).not.toContain("42");

    const broken = gateway([draft("Spend rose 42%."), draft("See {{missing}}.")]);
    const fallback = await answerStage(broken, { question: "How much did we spend?", evidence, model: model.id });
    expect(fallback.fallback).toBe(true);
    expect(fallback.answer.observations).toEqual(["Spend: 2550"]);
    expect(fallback.answer.interpretation).toBe("These figures come from tool results.");
    expect(numbersIn(`${fallback.answer.observations.join(" ")}\n${fallback.answer.interpretation}`)).toEqual(["2550"]);
    expect(broken.calls.complete).toHaveLength(2);
  });
});
