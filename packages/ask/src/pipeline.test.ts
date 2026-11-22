import { describe, expect, it } from "vitest";
import { FakeGateway, ModelGatewayError, type ModelGateway } from "@marketing-os/model-gateway";
import { askStreamEventSchema } from "@marketing-os/schemas";
import { runAsk } from "./pipeline";
import type { MetricReader } from "./types";

const catalog = ["mock.spend"];
const runId = "00000000-0000-4000-8000-000000000099";
const workspaceId = "00000000-0000-4000-8000-000000000010";
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

const answerDraft = JSON.stringify({
  observations: ["Spend was {{o1}}."],
  interpretation: "Within the selected range.",
});

function spendReader(status: "ok" | "no_data" = "ok"): MetricReader {
  return {
    async metricValue() {
      if (status === "no_data") {
        return {
          metricKey: "mock.spend",
          status: "no_data",
          value: null,
          unit: null,
          source: null,
          definitionVersion: null,
          fetchedAt: null,
          windows: [],
          scopes: [],
          coverage: { status: "no_data", requestedDays: 30, coveredDays: 0 },
        };
      }
      return {
        metricKey: "mock.spend",
        status: "ok",
        value: 2550,
        unit: "EUR",
        source: "mock",
        definitionVersion: "1",
        fetchedAt: "2026-04-01T15:00:00.000Z",
        windows: [{ start: "2026-03-02T00:00:00.000Z", end: "2026-04-01T00:00:00.000Z" }],
        scopes: ["mock-account-1"],
        coverage: { status: "full", requestedDays: 30, coveredDays: 30 },
      };
    },
    async metricCompare() {
      throw new Error("unused");
    },
    async dataHealth() {
      return [];
    },
    async listMetrics() {
      return [];
    },
  };
}

function gateway(scripts: string[]) {
  return new FakeGateway({
    models: [model],
    completeScripts: scripts.map((content) => ({ content })),
  });
}

async function collect(fake: ModelGateway, extra: Partial<Parameters<typeof runAsk>[0]> = {}) {
  const events = [];
  for await (const event of runAsk({
    question: "How much did we spend?",
    catalog,
    model: model.id,
    gateway: fake,
    reader: spendReader(),
    workspaceId,
    runId,
    now: new Date("2026-04-01T15:00:00.000Z"),
    labels: { "mock.spend": "Spend" },
    ...extra,
  })) {
    events.push(askStreamEventSchema.parse(event));
  }
  return events;
}

describe("runAsk", () => {
  it("streams the golden FakeGateway path in order", async () => {
    const events = await collect(gateway([answerable, answerDraft]));
    expect(events.map((event) => (event.type === "stage" ? `stage:${event.stage}` : event.type))).toEqual([
      "stage:query_plan",
      "plan",
      "stage:validation",
      "tool_result",
      "evidence",
      "stage:answer",
      "delta",
      "delta",
      "answer",
      "done",
    ]);
    const answer = events.find((event) => event.type === "answer");
    expect(answer?.type === "answer" && answer.answer.observations).toEqual(["Spend: 2550"]);
    expect(events.at(-1)).toMatchObject({ type: "done", runId });
  });

  it.each([
    ["out_of_scope", { intent: "out_of_scope", refusalMessage: "Outside marketing metrics.", steps: [] }],
    ["needs_clarification", { intent: "needs_clarification", clarification: "Which account?", steps: [] }],
  ] as const)("refuses %s from the plan", async (code, plan) => {
    const events = await collect(gateway([JSON.stringify(plan)]));
    expect(events.map((event) => event.type)).toEqual(["stage", "plan", "refusal", "done"]);
    expect(events[2]).toMatchObject({ type: "refusal", code });
  });

  it("refuses a campaign question without calling the model", async () => {
    const fake = gateway([answerable]);
    const events = await collect(fake, { question: "Spend by campaign" });
    expect(events.map((event) => event.type)).toEqual(["stage", "plan", "refusal", "done"]);
    expect(events[2]).toMatchObject({ type: "refusal", code: "unsupported_dimension" });
    expect(fake.calls.complete).toHaveLength(0);
  });

  it("refuses an invalid plan and an empty tool result", async () => {
    const invalid = await collect(gateway(["not json", "{"]));
    expect(invalid.map((event) => event.type)).toEqual(["stage", "refusal", "done"]);
    expect(invalid[1]).toMatchObject({ type: "refusal", code: "plan_invalid" });

    const empty = await collect(gateway([answerable]), { reader: spendReader("no_data") });
    expect(empty.map((event) => event.type)).toContain("tool_result");
    expect(empty.find((event) => event.type === "refusal")).toMatchObject({ type: "refusal", code: "no_data" });
    expect(empty.some((event) => event.type === "answer")).toBe(false);
  });

  it("turns budget and model outages into refusals", async () => {
    const budget = gateway([]);
    budget.complete = async () => {
      throw new ModelGatewayError("Monthly model budget exceeded", "budget_exceeded");
    };
    const budgetEvents = await collect(budget);
    expect(budgetEvents[1]).toMatchObject({ type: "refusal", code: "budget_exceeded" });

    const down = gateway([]);
    down.complete = async () => {
      throw new ModelGatewayError("down", "provider_unavailable", true);
    };
    const downEvents = await collect(down);
    expect(downEvents[1]).toMatchObject({ type: "refusal", code: "model_unavailable" });
  });

  it("emits an error event when the provider rate limits", async () => {
    const fake = gateway([]);
    fake.complete = async () => {
      throw new ModelGatewayError("slow down", "rate_limited", true);
    };
    const events = await collect(fake);
    expect(events.map((event) => event.type)).toEqual(["stage", "error", "done"]);
    expect(events[1]).toMatchObject({ type: "error", code: "rate_limited" });
  });

  it("propagates abort before the model is called", async () => {
    const fake = gateway([answerable]);
    await expect(collect(fake, { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" });
    expect(fake.calls.complete).toHaveLength(0);
  });
});
