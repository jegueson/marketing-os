import { evidenceSchema, type AskPrimaryRangePreset, type Evidence, type ObservedFact, type ToolResult } from "@marketing-os/schemas";

const ASSUMPTION = "Values are UTC window aggregates.";

const RANGE_LABEL: Record<AskPrimaryRangePreset, string> = {
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  this_month: "This month",
  last_month: "Last month",
};

export type EvidenceInput = {
  workspaceId: string;
  preset: AskPrimaryRangePreset;
  from: string;
  to: string;
  labels?: Readonly<Record<string, string>>;
  displayNames?: Readonly<Record<string, string>>;
};

function labelFor(key: string, labels: Readonly<Record<string, string>> | undefined): string {
  return labels?.[key] ?? key;
}

function fact(input: {
  ref: string;
  stepId: string;
  label: string;
  value: number;
  unit: string | null;
  definitionKey: string;
  definitionVersion: string;
}): ObservedFact {
  return {
    ref: input.ref,
    stepId: input.stepId,
    label: input.label,
    value: input.value,
    unit: input.unit,
    definitionKey: input.definitionKey,
    definitionVersion: input.definitionVersion,
  };
}

/** Build Evidence from tool results. No model call. Observed facts are numbers from tools only. */
export function buildEvidence(results: readonly ToolResult[], input: EvidenceInput): Evidence {
  const labels = input.labels;
  const warnings = new Set<string>();
  const observed: ObservedFact[] = [];
  const definitions = new Map<string, { key: string; version: string; label: string }>();
  const sources = new Map<string, { connectionId: string; connector: string; displayName: string }>();
  let errorHealth = false;
  let staleHealth = false;
  let ref = 0;

  const nextRef = () => {
    ref += 1;
    return `o${ref}`;
  };

  const rememberDefinition = (key: string, version: string) => {
    definitions.set(`${key}@${version}`, { key, version, label: labelFor(key, labels) });
  };

  for (const result of results) {
    if (result.tool === "data_health" && result.status === "ok") {
      for (const item of result.items) {
        if (item.health === "error") errorHealth = true;
        if (item.health === "stale") {
          staleHealth = true;
          warnings.add("stale");
        }
        if (item.health === "never_synced") warnings.add("never_synced");
        sources.set(item.connectionId, {
          connectionId: item.connectionId,
          connector: item.connector,
          displayName: input.displayNames?.[item.connectionId] ?? item.connector,
        });
      }
      continue;
    }
    if (result.status === "no_data") {
      warnings.add("no data");
      continue;
    }
    if (result.status === "error") {
      warnings.add("unresolved metric");
      continue;
    }
    if (result.tool === "metric_value") {
      if (result.coverage && result.coverage.coveredDays < result.coverage.requestedDays) {
        warnings.add("partial coverage");
      }
      rememberDefinition(result.definitionKey, result.definitionVersion);
      observed.push(
        fact({
          ref: nextRef(),
          stepId: result.stepId,
          label: labelFor(result.definitionKey, labels),
          value: result.value,
          unit: result.unit,
          definitionKey: result.definitionKey,
          definitionVersion: result.definitionVersion,
        }),
      );
      continue;
    }
    if (result.tool === "metric_compare") {
      if (result.coverage && result.coverage.coveredDays < result.coverage.requestedDays) {
        warnings.add("partial coverage");
      }
      rememberDefinition(result.definitionKey, result.definitionVersion);
      observed.push(
        fact({
          ref: nextRef(),
          stepId: result.stepId,
          label: labelFor(result.definitionKey, labels),
          value: result.current,
          unit: result.unit,
          definitionKey: result.definitionKey,
          definitionVersion: result.definitionVersion,
        }),
      );
      if (result.previous != null) {
        observed.push(
          fact({
            ref: nextRef(),
            stepId: result.stepId,
            label: `${labelFor(result.definitionKey, labels)} previous period`,
            value: result.previous,
            unit: result.unit,
            definitionKey: result.definitionKey,
            definitionVersion: result.definitionVersion,
          }),
        );
      }
    }
  }

  const freshness = errorHealth ? "error" : staleHealth ? "stale" : observed.length === 0 ? "empty" : "live";
  const qualityWarnings = ["stale", "never_synced", "partial coverage", "no data", "unresolved metric"].filter((warning) =>
    warnings.has(warning),
  );

  return evidenceSchema.parse({
    sources: [...sources.values()].sort((left, right) => left.connectionId.localeCompare(right.connectionId)),
    range: {
      preset: input.preset,
      from: input.from,
      to: input.to,
      label: RANGE_LABEL[input.preset],
    },
    filters: { workspaceId: input.workspaceId },
    freshness,
    qualityWarnings,
    assumptions: [ASSUMPTION],
    definitions: [...definitions.values()].sort((left, right) => left.key.localeCompare(right.key)),
    observed,
  });
}
