import { z } from "zod";

export const metricDefinitionSchema = z.object({
  key: z.string().min(1),
  source: z.string().min(1),
  version: z.string().min(1),
  label: z.string().min(1),
  unit: z.string().optional(),
  formula: z.string().optional(),
});

export type MetricDefinition = z.infer<typeof metricDefinitionSchema>;

export type MetricValue = {
  key: string;
  value: number;
  definitionVersion: string;
  source: string;
  asOf: string;
};

/** Never merge differing definitions for the same key+source. */
export function registerDefinitions(
  existing: MetricDefinition[],
  incoming: MetricDefinition[],
): MetricDefinition[] {
  const byKey = new Map(existing.map((d) => [`${d.source}:${d.key}`, d]));
  for (const next of incoming) {
    const id = `${next.source}:${next.key}`;
    const prev = byKey.get(id);
    if (prev && prev.version !== next.version && prev.formula !== next.formula) {
      throw new Error(
        `Refusing to merge metric ${id}: version ${prev.version} vs ${next.version}`,
      );
    }
    byKey.set(id, next);
  }
  return [...byKey.values()];
}

export function evaluateFormula(
  formula: string,
  vars: Record<string, number>,
): number {
  if (!/^[a-zA-Z0-9_+\-*/().\s]+$/.test(formula)) {
    throw new Error("Invalid formula");
  }
  const keys = Object.keys(vars);
  const fn = new Function(...keys, `return (${formula});`) as (
    ...args: number[]
  ) => number;
  return fn(...keys.map((k) => vars[k]!));
}
