import { queryPlanSchema, type QueryPlan } from "@marketing-os/schemas";

/** Parsed plan. Executors take this type, not raw model output. */
export type ValidatedPlan = QueryPlan;

export class PlanValidationError extends Error {
  readonly code = "plan_invalid";
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(issues.join("; "));
    this.name = "PlanValidationError";
    this.issues = issues;
  }
}

function schemaIssues(error: { issues: readonly { path: PropertyKey[]; message: string }[] }): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

/**
 * Only path from model output to an executor.
 * Schema limits tools, extra keys, and step count. Catalog limits metric keys.
 */
export function validatePlan(raw: unknown, catalog: readonly string[]): ValidatedPlan {
  const parsed = queryPlanSchema.safeParse(raw);
  if (!parsed.success) throw new PlanValidationError(schemaIssues(parsed.error));
  if (parsed.data.intent !== "answerable") return parsed.data;

  const allowed = new Set(catalog);
  const unknown = parsed.data.steps.flatMap((step) => {
    if (step.tool !== "metric_value" && step.tool !== "metric_compare") return [];
    return allowed.has(step.metricKey) ? [] : [`unknown metric ${step.metricKey}`];
  });
  if (unknown.length > 0) throw new PlanValidationError(unknown);
  return parsed.data;
}
