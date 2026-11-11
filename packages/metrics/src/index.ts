import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";

/** Sprint 2 formula set: sum, ratio, and filter. Nothing else evaluates. */
export const formulaSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("sum"), metric: z.string().min(1) }),
  z.object({
    op: z.literal("ratio"),
    numerator: z.string().min(1),
    denominator: z.string().min(1),
  }),
  z.object({
    op: z.literal("filter"),
    metric: z.string().min(1),
    field: z.string().min(1),
    equals: z.string().min(1),
  }),
]);

export type Formula = z.infer<typeof formulaSchema>;

export const metricDefinitionSchema = z.object({
  key: z.string().min(1),
  source: z.string().min(1),
  version: z.string().min(1),
  label: z.string().min(1),
  unit: z.string().min(1).optional(),
  formula: formulaSchema.optional(),
});

export type MetricDefinition = z.infer<typeof metricDefinitionSchema>;

/** Lineage shape shared with the connector SDK metric result. */
export const metricLineageSchema = z.object({
  source: z.string().min(1),
  fetchedAt: z.string().datetime(),
  definitionVersion: z.string().min(1),
});

export const metricValueSchema = z.object({
  key: z.string().min(1),
  value: z.number(),
  unit: z.string().optional(),
  lineage: metricLineageSchema,
});

export type MetricValue = z.infer<typeof metricValueSchema>;

export const metricsDocumentSchema = z.object({
  version: z.literal(1),
  definitions: z.array(metricDefinitionSchema).min(1),
});

export type MetricsDocument = z.infer<typeof metricsDocumentSchema>;

function formulaKey(formula: Formula | undefined): string {
  return formula ? JSON.stringify(formula) : "";
}

function sameFormula(left: MetricDefinition, right: MetricDefinition): boolean {
  return formulaKey(left.formula) === formulaKey(right.formula);
}

/**
 * Register definitions for one scope (platform or one tenant).
 * A second definition for the same source and key is refused when the version or formula differs.
 */
export function registerDefinitions(
  existing: MetricDefinition[],
  incoming: MetricDefinition[],
): MetricDefinition[] {
  const byKey = new Map(existing.map((definition) => [`${definition.source}:${definition.key}`, definition]));
  for (const next of incoming) {
    const id = `${next.source}:${next.key}`;
    const prev = byKey.get(id);
    if (prev && (prev.version !== next.version || !sameFormula(prev, next))) {
      throw new Error(`Refusing to merge metric ${id}: version ${prev.version} vs ${next.version}`);
    }
    byKey.set(id, next);
  }
  return [...byKey.values()];
}

/** Tenant rows replace platform rows with the same key. Platform rows stay in the database. */
export function resolveCatalog(
  platform: MetricDefinition[],
  overrides: MetricDefinition[],
): MetricDefinition[] {
  const byKey = new Map(platform.map((definition) => [definition.key, definition]));
  for (const override of overrides) byKey.set(override.key, override);
  return [...byKey.values()];
}

function lookup(vars: Record<string, number>, name: string): number {
  const value = vars[name];
  if (value === undefined) throw new Error(`Missing metric ${name}`);
  return value;
}

export function evaluateExpression(
  formula: Formula,
  vars: Record<string, number>,
  dimensions: Record<string, string> = {},
): number {
  if (formula.op === "sum") return lookup(vars, formula.metric);
  if (formula.op === "ratio") {
    const denominator = lookup(vars, formula.denominator);
    if (denominator === 0) throw new Error(`Division by zero in ratio ${formula.numerator}/${formula.denominator}`);
    return lookup(vars, formula.numerator) / denominator;
  }
  if (dimensions[formula.field] !== formula.equals) {
    throw new Error(`Filter excluded ${formula.metric} where ${formula.field}=${formula.equals}`);
  }
  return lookup(vars, formula.metric);
}

/** Evaluate formula definitions from source inputs. Source keys must already be numbers. */
export function evaluateCatalog(
  definitions: MetricDefinition[],
  inputs: Record<string, number>,
): Record<string, number> {
  const values: Record<string, number> = { ...inputs };
  const pending = definitions.filter((definition) => definition.formula);
  for (let pass = 0; pass < pending.length + 1; pass += 1) {
    let progressed = false;
    for (const definition of pending) {
      if (values[definition.key] !== undefined || !definition.formula) continue;
      try {
        values[definition.key] = evaluateExpression(definition.formula, values);
        progressed = true;
      } catch (err) {
        if (!(err instanceof Error) || !err.message.startsWith("Missing metric")) throw err;
      }
    }
    if (!progressed) break;
  }
  const missing = pending.filter((definition) => values[definition.key] === undefined).map((definition) => definition.key);
  if (missing.length) throw new Error(`Unresolved metrics: ${missing.join(", ")}`);
  return values;
}

/** The cockpit refuses a number that has no definition version. */
export function renderMetric(value: {
  value: number;
  lineage?: Partial<z.infer<typeof metricLineageSchema>> | null;
}): number {
  const version = value.lineage?.definitionVersion;
  if (!version) throw new Error("Refusing to render a metric without a definition version");
  return value.value;
}

export function parseMetricsYaml(source: string): MetricsDocument {
  let raw: unknown;
  try {
    raw = parse(source);
  } catch (err) {
    throw new Error(`metrics.yaml is not valid YAML: ${(err as Error).message}`);
  }
  const parsed = metricsDocumentSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`metrics.yaml is invalid: ${parsed.error.message}`);
  registerDefinitions([], parsed.data.definitions);
  return parsed.data;
}

export function loadMetricsYaml(path: string): MetricsDocument {
  return parseMetricsYaml(readFileSync(path, "utf8"));
}
