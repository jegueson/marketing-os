import { evaluateAvailable, kpiWidgets, platformKpiKeys, type MetricDefinition } from "./index";

export type KpiFreshness = "live" | "stale" | "empty" | "error";

export type KpiPoint = {
  value: number;
  definitionVersion: string;
  fetchedAt?: string;
};

export type KpiCard = {
  key: string;
  label: string;
  value: number | null;
  previous: number | null;
  target: number | null;
  delta: number | null;
  source: string;
  freshness: KpiFreshness;
  definitionVersion: string | null;
  widgets: Array<(typeof kpiWidgets)[number]>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function cardSource(definition: MetricDefinition): string {
  if (definition.formula?.op === "sum") return definition.formula.metric.split(".")[0] ?? definition.source;
  return definition.source;
}

function freshnessOf(fetchedAt: string | undefined, now: Date, health: KpiFreshness | null): KpiFreshness {
  if (health === "error") return "error";
  if (!fetchedAt) return "empty";
  return now.getTime() - Date.parse(fetchedAt) > DAY_MS ? "stale" : "live";
}

/**
 * Builds cockpit cards for the platform KPIs. A source point with no definition
 * version is dropped, and a KPI that depends on it is not rendered.
 */
export function buildKpiCards(input: {
  definitions: MetricDefinition[];
  current: Record<string, KpiPoint | { value: number; definitionVersion?: string | null; fetchedAt?: string }>;
  previous?: Record<string, KpiPoint | { value: number; definitionVersion?: string | null }>;
  health?: KpiFreshness | null;
  now?: Date;
}): KpiCard[] {
  const now = input.now ?? new Date();
  const current: Record<string, number> = {};
  const fetchedAt = new Map<string, string>();
  for (const [key, point] of Object.entries(input.current)) {
    if (!point.definitionVersion) continue;
    current[key] = point.value;
    if (point.fetchedAt) fetchedAt.set(key, point.fetchedAt);
  }
  const previous: Record<string, number> = {};
  for (const [key, point] of Object.entries(input.previous ?? {})) {
    if (!point.definitionVersion) continue;
    previous[key] = point.value;
  }
  const currentValues = evaluateAvailable(input.definitions, current);
  const previousValues = evaluateAvailable(input.definitions, previous);
  const wanted = new Set<string>(platformKpiKeys);

  return input.definitions.flatMap((definition) => {
    if (!wanted.has(definition.key)) return [];
    const value = currentValues[definition.key];
    if (value === undefined) return [];
    const prior = previousValues[definition.key];
    const sourceKey = definition.formula?.op === "sum" ? definition.formula.metric : definition.key;
    return [
      {
        key: definition.key,
        label: definition.label,
        value,
        previous: prior ?? null,
        target: definition.target ?? null,
        delta: prior === undefined ? null : value - prior,
        source: cardSource(definition),
        freshness: freshnessOf(fetchedAt.get(sourceKey), now, input.health ?? null),
        definitionVersion: definition.version,
        widgets: definition.widgets ?? [],
      },
    ];
  });
}
