import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PlanValidationError, validatePlan, type ValidatedPlan } from "./validate";

const catalog = ["mock.spend", "mock.sessions"];

const valid = {
  intent: "answerable" as const,
  steps: [{ id: "s1", tool: "metric_value" as const, metricKey: "mock.spend", range: "last_30_days" as const }],
};

function sources(dir: string): string {
  const chunks: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) chunks.push(sources(path));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) chunks.push(readFileSync(path, "utf8"));
  }
  return chunks.join("\n");
}

describe("validatePlan", () => {
  it("returns a plan the executor can accept", () => {
    const plan: ValidatedPlan = validatePlan(valid, catalog);
    expect(plan.intent).toBe("answerable");
  });

  it("rejects an unknown metric and an unknown tool", () => {
    expect(() =>
      validatePlan(
        { intent: "answerable", steps: [{ id: "s1", tool: "metric_value", metricKey: "nope.spend", range: "last_7_days" }] },
        catalog,
      ),
    ).toThrow(PlanValidationError);
    expect(() =>
      validatePlan(
        { intent: "answerable", steps: [{ id: "s1", tool: "metric_value", metricKey: "nope.spend", range: "last_7_days" }] },
        catalog,
      ),
    ).toThrow(/unknown metric nope.spend/);
    expect(() =>
      validatePlan(
        { intent: "answerable", steps: [{ id: "s1", tool: "sql", metricKey: "mock.spend" }] },
        catalog,
      ),
    ).toThrow(PlanValidationError);
  });

  it("rejects extra keys", () => {
    expect(() => validatePlan({ ...valid, sql: "select 1" }, catalog)).toThrow(PlanValidationError);
    expect(() =>
      validatePlan(
        { intent: "answerable", steps: [{ ...valid.steps[0], tenantId: "t" }] },
        catalog,
      ),
    ).toThrow(PlanValidationError);
  });

  it("rejects more than 6 steps", () => {
    const steps = Array.from({ length: 7 }, (_, index) => ({
      id: `s${index + 1}`,
      tool: "list_metrics" as const,
    }));
    expect(() => validatePlan({ intent: "answerable", steps }, catalog)).toThrow(PlanValidationError);
  });

  it("imports no database client", () => {
    const src = sources(dirname(fileURLToPath(import.meta.url)));
    expect(src).not.toMatch(/drizzle-orm|@marketing-os\/db|from ["']postgres["']|sql`/);
  });
});
