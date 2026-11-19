import { describe, expect, it } from "vitest";
import { FakeGateway } from "@marketing-os/model-gateway";
import { PlanValidationError, planStage } from "./index";
import type { ValidatedPlan } from "./validate";

const catalog = ["mock.spend", "mock.sessions"];
const model = {
  id: "gpt-test",
  displayName: "GPT Test",
  provider: "openai_compatible" as const,
  inputPriceMicroUsdPer1M: 1,
  outputPriceMicroUsdPer1M: 1,
};

const answerable = JSON.stringify({
  intent: "answerable",
  steps: [{ id: "s1", tool: "metric_value", metricKey: "mock.spend", range: "last_30_days" }],
});

function gateway(scripts: string[]) {
  return new FakeGateway({
    models: [model],
    completeScripts: scripts.map((content) => ({ content })),
  });
}

describe("planStage", () => {
  it("parses ask.plan@1 structured output from FakeGateway", async () => {
    const fake = gateway([answerable]);
    const result = await planStage(fake, { question: "How much did we spend?", catalog, model: model.id });
    expect(result.promptName).toBe("ask.plan");
    expect(result.promptVersion).toBe("1");
    expect(result.repaired).toBe(false);
    expect(result.plan.intent).toBe("answerable");
    expect(fake.calls.complete).toHaveLength(1);
    const call = fake.calls.complete[0];
    expect(call?.responseFormat).toMatchObject({ type: "json_schema", name: "QueryPlan" });
    expect(call?.messages[0]?.content).toContain("do not invent numbers");
    expect(call?.messages[1]?.content).toContain("<<<DATA question>>>");
    expect(call?.messages[1]?.content).toContain("How much did we spend?");
    expect(call?.temperature).toBe(0.2);
  });

  it("retries once and then raises plan_invalid", async () => {
    const repaired = gateway(["not json", answerable]);
    const ok = await planStage(repaired, { question: "How much did we spend?", catalog, model: model.id });
    expect(ok.repaired).toBe(true);
    expect(ok.plan.intent).toBe("answerable");
    expect(repaired.calls.complete).toHaveLength(2);

    const broken = gateway(["not json", "{"]);
    await expect(planStage(broken, { question: "How much did we spend?", catalog, model: model.id })).rejects.toMatchObject({
      code: "plan_invalid",
    });
    expect(broken.calls.complete).toHaveLength(2);
    await expect(planStage(gateway(["not json", "{"]), { question: "again", catalog, model: model.id })).rejects.toBeInstanceOf(
      PlanValidationError,
    );
  });

  it("refuses campaign and channel questions as unsupported_dimension", async () => {
    const fake = gateway([answerable]);
    const campaign = await planStage(fake, { question: "Spend by campaign last month", catalog, model: model.id });
    const channel = await planStage(fake, { question: "Which channel drove sessions?", catalog, model: model.id });
    expect(campaign.plan).toMatchObject({ intent: "unsupported_dimension", steps: [] });
    expect(channel.plan).toMatchObject({ intent: "unsupported_dimension", steps: [] });
    expect(campaign.promptVersion).toBe("1");
    expect(fake.calls.complete).toHaveLength(0);
  });

  it("reuses the prior plan for a follow-up", async () => {
    const prior = {
      intent: "answerable",
      steps: [{ id: "s1", tool: "metric_value", metricKey: "mock.spend", range: "last_30_days" }],
    } as ValidatedPlan;
    const fake = gateway([answerable]);
    const result = await planStage(fake, {
      question: "what about last month?",
      catalog,
      model: model.id,
      priorPlan: prior,
    });
    expect(result.plan).toBe(prior);
    expect(result.promptVersion).toBe("1");
    expect(fake.calls.complete).toHaveLength(0);
  });
});
