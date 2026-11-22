import type { AskRangePreset, RangeCoverage } from "@marketing-os/metrics/windows";

export type MetricWindow = {
  start: string;
  end: string;
};

/** One observed metric. A number is returned only when every contributing row has a definition version. */
export type MetricObservation = {
  metricKey: string;
  status: "ok" | "no_data";
  value: number | null;
  unit: string | null;
  source: string | null;
  definitionVersion: string | null;
  fetchedAt: string | null;
  windows: MetricWindow[];
  scopes: string[];
  coverage: RangeCoverage;
};

export type MetricComparison = {
  metricKey: string;
  status: "ok" | "no_data";
  current: number | null;
  previous: number | null;
  delta: number | null;
  source: string | null;
  definitionVersion: string | null;
  fetchedAt: string | null;
  windows: MetricWindow[];
  scopes: string[];
};

export type DataHealthReading = {
  connectionId: string;
  connector: string;
  health: "healthy" | "stale" | "error" | "never_synced";
  message: string | null;
  scopes: string[];
};

export type ListedMetric = {
  key: string;
  source: string;
  version: string;
  label: string;
  unit: string | null;
};

export type MetricQuery = {
  metricKey: string;
  range: AskRangePreset;
};

/**
 * Read-only metric tools. Implementations must not write, and must not import
 * this interface from a module that opens a read-write transaction.
 */
export interface MetricReader {
  metricValue(query: MetricQuery): Promise<MetricObservation>;
  metricCompare(query: MetricQuery): Promise<MetricComparison>;
  dataHealth(): Promise<DataHealthReading[]>;
  listMetrics(): Promise<ListedMetric[]>;
}
