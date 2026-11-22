import { describe, expect, it } from "vitest";
import { toolResultSchema } from "@marketing-os/schemas";
import { executePlan } from "./execute";
import type { MetricReader } from "./types";
import { validatePlan, type ValidatedPlan } from "./validate";

const catalog = ["mock.spend", "mock.sessions"];

function okValue(metricKey: string, value: number) {
  return {
    metricKey,
    status: "ok" as const,
    value,
    unit: "currency",
    source: "mock",
    definitionVersion: "1",
    fetchedAt: "2026-04-01T15:00:00.000Z",
    windows: [{ start: "2026-03-02T00:00:00.000Z", end: "2026-04-01T00:00:00.000Z" }],
    scopes: ["mock-account-1"],
    coverage: { status: "full" as const, requestedDays: 30, coveredDays: 30 },
  };
}

function reader(overrides: Partial<MetricReader> = {}): MetricReader & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async metricValue(query) {
      calls.push(`metric_value:${query.metricKey}`);
      return okValue(query.metricKey, query.metricKey === "mock.sessions" ? 10 : 2550);
    },
    async metricCompare(query) {
      calls.push(`metric_compare:${query.metricKey}`);
      return {
        ...okValue(query.metricKey, 2550),
        current: 2550,
        previous: 2000,
        delta: 550,
      };
    },
    async dataHealth() {
      calls.push("data_health");
      return [
        {
          connectionId: "00000000-0000-4000-8000-000000000001",
          connector: "mock",
          health: "healthy",
          message: null,
          scopes: ["mock-account-1"],
        },
      ];
    },
    async listMetrics() {
      calls.push("list_metrics");
      return [{ key: "mock.spend", source: "mock", version: "1", label: "Mock spend", unit: "currency" }];
    },
    ...overrides,
  };
}

function plan(steps: ValidatedPlan["steps"]): ValidatedPlan {
  return validatePlan({ intent: "answerable", steps }, catalog);
}

describe("executePlan", () => {
  it("runs steps in order and returns tool results", async () => {
    const fake = reader();
    const executed = await executePlan(
      plan([
        { id: "s1", tool: "metric_value", metricKey: "mock.spend", range: "last_30_days" },
        { id: "s2", tool: "list_metrics" },
        { id: "s3", tool: "data_health" },
      ]),
      fake,
    );
    expect(fake.calls).toEqual(["metric_value:mock.spend", "list_metrics", "data_health"]);
    expect(executed.results.map((result) => result.stepId)).toEqual(["s1", "s2", "s3"]);
    expect(executed.results.every((result) => toolResultSchema.safeParse(result).success)).toBe(true);
    expect(executed.results[0]).toMatchObject({ status: "ok", value: 2550, definitionVersion: "1" });
  });

  it("keeps later steps when one step throws", async () => {
    const fake = reader({
      async metricCompare() {
        throw new Error("reader down");
      },
    });
    const executed = await executePlan(
      plan([
        { id: "s1", tool: "metric_value", metricKey: "mock.spend", range: "last_30_days" },
        { id: "s2", tool: "metric_compare", metricKey: "mock.spend", range: "last_30_days", compareTo: "previous_period" },
        { id: "s3", tool: "metric_value", metricKey: "mock.sessions", range: "last_7_days" },
      ]),
      fake,
    );
    expect(executed.results.map((result) => result.status)).toEqual(["ok", "error", "ok"]);
    expect(executed.results[1]).toEqual({ stepId: "s2", tool: "metric_compare", status: "error", message: "Step failed" });
    expect(executed.results[1]).not.toHaveProperty("value");
    expect(executed.results[1]).not.toHaveProperty("current");
    expect(executed.qualityWarnings).toEqual(["step s2 failed"]);
    expect(executed.results[2]).toMatchObject({ value: 10 });
  });

  it("turns a timeout into a warning and does not invent a value", async () => {
    const fake = reader({
      async metricValue() {
        return new Promise(() => {});
      },
    });
    const executed = await executePlan(
      plan([
        { id: "slow", tool: "metric_value", metricKey: "mock.spend", range: "last_30_days" },
        { id: "next", tool: "list_metrics" },
      ]),
      fake,
      { timeoutMs: 20 },
    );
    expect(executed.results[0]).toEqual({ stepId: "slow", tool: "metric_value", status: "error", message: "Timed out" });
    expect(JSON.stringify(executed.results[0])).not.toMatch(/2550|"value"/);
    expect(executed.qualityWarnings).toEqual(["step slow timed out"]);
    expect(executed.results[1]).toMatchObject({ stepId: "next", status: "ok" });
  });
});
