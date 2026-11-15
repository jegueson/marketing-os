import { describe, expect, it } from "vitest";
import {
  answerSchema,
  askStreamEventSchema,
  evidenceSchema,
  queryPlanSchema,
  toolResultSchema,
} from "./ask";

const validStep = {
  id: "s1",
  tool: "metric_value" as const,
  metricKey: "mock.spend",
  range: "last_30_days" as const,
};

const validPlan = {
  intent: "answerable" as const,
  steps: [validStep],
};

const validObserved = {
  ref: "spend",
  stepId: "s1",
  label: "Spend",
  value: 1200,
  unit: "EUR",
  definitionKey: "mock.spend",
  definitionVersion: "1",
};

const validEvidence = {
  sources: [
    {
      connectionId: "00000000-0000-4000-8000-000000000001",
      connector: "mock",
      displayName: "Mock",
    },
  ],
  range: { preset: "last_30_days" as const, from: "2026-10-14", to: "2026-11-13", label: "Last 30 days" },
  filters: { workspaceId: "00000000-0000-4000-8000-000000000002" },
  freshness: "live" as const,
  qualityWarnings: [] as string[],
  assumptions: ["Values are UTC window aggregates."],
  definitions: [{ key: "mock.spend", version: "1", label: "Spend" }],
  observed: [validObserved],
};

describe("queryPlanSchema", () => {
  it("accepts a valid answerable plan", () => {
    expect(queryPlanSchema.parse(validPlan)).toMatchObject({
      intent: "answerable",
      steps: [{ tool: "metric_value", metricKey: "mock.spend" }],
    });
  });

  it.each(["sql", "tenantId", "workspaceId", "connectionId"] as const)(
    "rejects plan-level %s",
    (key) => {
      expect(queryPlanSchema.safeParse({ ...validPlan, [key]: "x" }).success).toBe(false);
    },
  );

  it("rejects sql on a step", () => {
    expect(
      queryPlanSchema.safeParse({
        intent: "answerable",
        steps: [{ ...validStep, sql: "select 1" }],
      }).success,
    ).toBe(false);
  });

  it("rejects more than 6 steps", () => {
    const steps = Array.from({ length: 7 }, (_, i) => ({
      ...validStep,
      id: `s${i + 1}`,
    }));
    expect(queryPlanSchema.safeParse({ intent: "answerable", steps }).success).toBe(false);
  });

  it("rejects answerable with no steps", () => {
    expect(queryPlanSchema.safeParse({ intent: "answerable", steps: [] }).success).toBe(false);
  });

  it("rejects out_of_scope with steps or without refusalMessage", () => {
    expect(
      queryPlanSchema.safeParse({ intent: "out_of_scope", refusalMessage: "nope", steps: [validStep] }).success,
    ).toBe(false);
    expect(queryPlanSchema.safeParse({ intent: "out_of_scope", steps: [] }).success).toBe(false);
  });

  it("accepts refusal intents with empty steps", () => {
    expect(
      queryPlanSchema.parse({
        intent: "out_of_scope",
        refusalMessage: "That is outside marketing data.",
        steps: [],
      }).intent,
    ).toBe("out_of_scope");
    expect(
      queryPlanSchema.parse({
        intent: "needs_clarification",
        clarification: "Which metric?",
        steps: [],
      }).intent,
    ).toBe("needs_clarification");
    expect(
      queryPlanSchema.parse({
        intent: "unsupported_dimension",
        refusalMessage: "Campaign breakouts are not available.",
        steps: [],
      }).intent,
    ).toBe("unsupported_dimension");
  });

  it("rejects duplicate step ids and missing metricKey", () => {
    expect(
      queryPlanSchema.safeParse({
        intent: "answerable",
        steps: [validStep, { ...validStep, id: "s1", metricKey: "mock.leads" }],
      }).success,
    ).toBe(false);
    expect(
      queryPlanSchema.safeParse({
        intent: "answerable",
        steps: [{ id: "s1", tool: "metric_value", range: "last_30_days" }],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown tools, bad metric keys, and previous_period as primary range", () => {
    expect(
      queryPlanSchema.safeParse({
        intent: "answerable",
        steps: [{ id: "s1", tool: "run_sql" }],
      }).success,
    ).toBe(false);
    expect(
      queryPlanSchema.safeParse({
        intent: "answerable",
        steps: [{ ...validStep, metricKey: "spend; drop table" }],
      }).success,
    ).toBe(false);
    expect(
      queryPlanSchema.safeParse({
        intent: "answerable",
        steps: [{ ...validStep, range: "previous_period" }],
      }).success,
    ).toBe(false);
    expect(
      queryPlanSchema.safeParse({
        intent: "answerable",
        steps: [{ ...validStep, range: "last_3_days" }],
      }).success,
    ).toBe(false);
  });

  it("requires compareTo previous_period for metric_compare", () => {
    expect(
      queryPlanSchema.parse({
        intent: "answerable",
        steps: [
          {
            id: "s1",
            tool: "metric_compare",
            metricKey: "mock.spend",
            range: "last_30_days",
            compareTo: "previous_period",
          },
        ],
      }).steps[0]?.tool,
    ).toBe("metric_compare");
    expect(
      queryPlanSchema.safeParse({
        intent: "answerable",
        steps: [{ id: "s1", tool: "metric_compare", metricKey: "mock.spend", range: "last_30_days" }],
      }).success,
    ).toBe(false);
  });
});

describe("toolResultSchema", () => {
  it("accepts ok metric_value with required payload", () => {
    const parsed = toolResultSchema.parse({
      stepId: "s1",
      tool: "metric_value",
      status: "ok",
      value: 1200,
      previous: 900,
      unit: "EUR",
      definitionKey: "mock.spend",
      definitionVersion: "1",
      source: "mock",
      fetchedAt: "2026-11-13T10:00:00.000Z",
      coverage: { requestedDays: 30, coveredDays: 30 },
    });
    expect(parsed.status).toBe("ok");
  });

  it("rejects ok without value and error without message", () => {
    expect(
      toolResultSchema.safeParse({
        stepId: "s1",
        tool: "metric_value",
        status: "ok",
        unit: "EUR",
        definitionKey: "mock.spend",
        definitionVersion: "1",
        source: "mock",
        fetchedAt: null,
      }).success,
    ).toBe(false);
    expect(
      toolResultSchema.safeParse({
        stepId: "s1",
        tool: "metric_value",
        status: "error",
      }).success,
    ).toBe(false);
  });

  it("rejects coveredDays greater than requestedDays and unknown keys", () => {
    expect(
      toolResultSchema.safeParse({
        stepId: "s1",
        tool: "metric_value",
        status: "ok",
        value: 1,
        unit: "EUR",
        definitionKey: "mock.spend",
        definitionVersion: "1",
        source: "mock",
        fetchedAt: null,
        coverage: { requestedDays: 7, coveredDays: 30 },
      }).success,
    ).toBe(false);
    expect(
      toolResultSchema.safeParse({
        stepId: "s1",
        tool: "metric_value",
        status: "ok",
        value: 1,
        unit: "EUR",
        definitionKey: "mock.spend",
        definitionVersion: "1",
        source: "mock",
        fetchedAt: null,
        rows: [],
      }).success,
    ).toBe(false);
  });

  it("accepts list_metrics and data_health ok payloads", () => {
    expect(
      toolResultSchema.parse({
        stepId: "s1",
        tool: "list_metrics",
        status: "ok",
        metrics: [
          {
            key: "mock.spend",
            label: "Spend",
            unit: "EUR",
            definitionVersion: "1",
            hasData: true,
          },
        ],
      }).tool,
    ).toBe("list_metrics");
    expect(
      toolResultSchema.parse({
        stepId: "s1",
        tool: "data_health",
        status: "ok",
        items: [
          {
            connectionId: "00000000-0000-4000-8000-000000000001",
            connector: "mock",
            health: "healthy",
            message: null,
          },
        ],
      }).tool,
    ).toBe("data_health");
  });
});

describe("evidenceSchema", () => {
  it("requires freshness and keeps observed as facts with stepId", () => {
    const evidence = evidenceSchema.parse(validEvidence);
    expect(evidence.freshness).toBe("live");
    expect(evidence.observed[0]).toMatchObject({ ref: "spend", stepId: "s1" });
    expect("interpretation" in evidence).toBe(false);
  });

  it("rejects evidence without freshness or with invalid dates", () => {
    const { freshness: _freshness, ...noFreshness } = validEvidence;
    expect(evidenceSchema.safeParse(noFreshness).success).toBe(false);
    expect(
      evidenceSchema.safeParse({
        ...validEvidence,
        range: { ...validEvidence.range, from: "xxxxxxxxxx", to: "2026-11-13" },
      }).success,
    ).toBe(false);
    expect(
      evidenceSchema.safeParse({
        ...validEvidence,
        range: { ...validEvidence.range, from: "2026-11-13", to: "2026-10-14" },
      }).success,
    ).toBe(false);
  });

  it("rejects interpretation on evidence and duplicate observed refs", () => {
    expect(evidenceSchema.safeParse({ ...validEvidence, interpretation: "nope" }).success).toBe(false);
    expect(
      evidenceSchema.safeParse({
        ...validEvidence,
        observed: [validObserved, { ...validObserved, stepId: "s2" }],
      }).success,
    ).toBe(false);
  });
});

describe("answerSchema", () => {
  it("keeps observations and interpretation as separate fields", () => {
    const answer = answerSchema.parse({
      observations: ["Spend was {{spend}}."],
      interpretation: "Spend rose versus the prior window.",
      assumptions: ["UTC windows."],
      evidence: validEvidence,
    });
    expect(answer.observations).toHaveLength(1);
    expect(answer.interpretation).toContain("rose");
  });

  it("rejects unknown observation placeholders", () => {
    expect(
      answerSchema.safeParse({
        observations: ["Spend was {{missing}}."],
        interpretation: "x",
        assumptions: [],
        evidence: validEvidence,
      }).success,
    ).toBe(false);
  });
});

describe("askStreamEventSchema", () => {
  it("round-trips every event variant", () => {
    const events = [
      { type: "stage" as const, stage: "intent" as const },
      { type: "plan" as const, plan: validPlan },
      {
        type: "tool_result" as const,
        result: {
          stepId: "s1",
          tool: "list_metrics" as const,
          status: "ok" as const,
          metrics: [],
        },
      },
      { type: "evidence" as const, evidence: { ...validEvidence, observed: [] } },
      { type: "delta" as const, field: "interpretation" as const, text: "Hello" },
      {
        type: "answer" as const,
        answer: {
          observations: ["Spend was {{spend}}."],
          interpretation: "ok",
          assumptions: ["UTC"],
          evidence: validEvidence,
        },
      },
      {
        type: "refusal" as const,
        code: "unsupported_dimension" as const,
        message: "Ask cannot break out by campaign.",
        suggestions: ["Ask for total spend."],
      },
      { type: "error" as const, code: "model_unavailable" as const, message: "Model unavailable." },
      { type: "done" as const, runId: "00000000-0000-4000-8000-000000000099" },
    ];

    for (const event of events) {
      expect(askStreamEventSchema.parse(event)).toEqual(event);
    }
  });

  it("rejects an unknown event type and free-form error codes", () => {
    expect(askStreamEventSchema.safeParse({ type: "sql", query: "select 1" }).success).toBe(false);
    expect(
      askStreamEventSchema.safeParse({ type: "error", code: "totally_made_up", message: "x" }).success,
    ).toBe(false);
  });
});
