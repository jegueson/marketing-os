import { coverRange, type RangeCoverage, type UtcRange } from "@marketing-os/metrics/windows";
import type { MetricObservation } from "./types";

type SumFormula = { op: "sum"; metric: string };
type RatioFormula = { op: "ratio"; numerator: string; denominator: string };
type FilterFormula = { op: "filter"; metric: string; field: string; equals: string };
type Formula = SumFormula | RatioFormula | FilterFormula;

export type ObservedDefinition = {
  key: string;
  source: string;
  unit?: string | undefined;
  formula?: Formula | undefined;
};

export type StoredMetricRow = {
  definitionKey: string;
  definitionVersion: string;
  value: number;
  fetchedAt: string;
  periodStart: string;
  periodEnd: string;
  dimensionHash: string;
};

function sourceOf(definition: ObservedDefinition): string {
  if (definition.formula?.op === "sum") return definition.formula.metric.split(".")[0] ?? definition.source;
  return definition.source;
}

function dependencyKeys(formula: Formula | undefined, key: string): string[] {
  if (!formula) return [key];
  if (formula.op === "sum") return [formula.metric];
  if (formula.op === "ratio") return [formula.numerator, formula.denominator];
  return [formula.metric];
}

function scopesOf(rows: readonly StoredMetricRow[]): string[] {
  const scopes = new Set<string>();
  for (const row of rows) {
    for (const part of row.dimensionHash.split("|")) {
      if (part) scopes.add(part);
    }
  }
  return [...scopes].sort();
}

function windowsOf(rows: readonly StoredMetricRow[]): MetricObservation["windows"] {
  return rows.map((row) => ({ start: row.periodStart, end: row.periodEnd }));
}

function emptyObservation(metricKey: string, source: string | null, unit: string | null, coverage: RangeCoverage): MetricObservation {
  return {
    metricKey,
    status: "no_data",
    value: null,
    unit,
    source,
    definitionVersion: null,
    fetchedAt: null,
    windows: [],
    scopes: [],
    coverage,
  };
}

/**
 * Sum stored windows that sit inside `range`. Rows with no definition version are ignored,
 * and mixed versions are not combined into one number.
 */
export function observeMetric(input: {
  metricKey: string;
  definition: ObservedDefinition | null;
  rows: readonly StoredMetricRow[];
  range: UtcRange;
  now: Date;
}): MetricObservation {
  const definition = input.definition;
  const source = definition ? sourceOf(definition) : null;
  const unit = definition?.unit ?? null;
  const keys = new Set(dependencyKeys(definition?.formula, input.metricKey));
  const versioned = input.rows.filter((row) => row.definitionVersion.trim().length > 0 && keys.has(row.definitionKey));
  const coverage = coverRange(
    input.range,
    versioned.map((row) => ({ start: new Date(row.periodStart), end: new Date(row.periodEnd) })),
    input.now,
  );
  const inside = versioned.filter((row) => {
    const start = new Date(row.periodStart).getTime();
    const end = new Date(row.periodEnd).getTime();
    return start >= input.range.start.getTime() && end <= input.range.end.getTime();
  });
  if (inside.length === 0 || coverage.status === "no_data") {
    return emptyObservation(input.metricKey, source, unit, coverage);
  }
  const versions = new Set(inside.map((row) => row.definitionVersion));
  if (versions.size !== 1) return emptyObservation(input.metricKey, source, unit, coverage);

  const sums = new Map<string, number>();
  for (const row of inside) {
    sums.set(row.definitionKey, (sums.get(row.definitionKey) ?? 0) + row.value);
  }
  let value: number;
  if (!definition?.formula) {
    value = sums.get(input.metricKey) ?? Number.NaN;
  } else if (definition.formula.op === "sum") {
    value = sums.get(definition.formula.metric) ?? Number.NaN;
  } else if (definition.formula.op === "ratio") {
    const denominator = sums.get(definition.formula.denominator);
    value = denominator ? (sums.get(definition.formula.numerator) ?? Number.NaN) / denominator : Number.NaN;
  } else {
    return emptyObservation(input.metricKey, source, unit, coverage);
  }
  if (!Number.isFinite(value)) return emptyObservation(input.metricKey, source, unit, coverage);

  const fetchedAt = inside.map((row) => row.fetchedAt).sort().at(-1) ?? null;
  return {
    metricKey: input.metricKey,
    status: "ok",
    value,
    unit,
    source,
    definitionVersion: inside[0]?.definitionVersion ?? null,
    fetchedAt,
    windows: windowsOf(inside),
    scopes: scopesOf(inside),
    coverage,
  };
}
