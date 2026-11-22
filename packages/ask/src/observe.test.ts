import { describe, expect, it } from "vitest";
import { observeMetric, type StoredMetricRow } from "./observe";

const now = new Date("2026-04-01T15:00:00.000Z");
const range = {
  start: new Date("2026-03-02T00:00:00.000Z"),
  end: new Date("2026-04-01T00:00:00.000Z"),
};

const spend = {
  key: "Spend",
  source: "formula",
  version: "1",
  label: "Spend",
  unit: "currency",
  formula: { op: "sum" as const, metric: "mock.spend" },
};

function row(overrides: Partial<StoredMetricRow> = {}): StoredMetricRow {
  return {
    definitionKey: "mock.spend",
    definitionVersion: "1",
    value: 2550,
    fetchedAt: "2026-04-01T15:00:00.000Z",
    periodStart: "2026-03-02T00:00:00.000Z",
    periodEnd: "2026-04-01T00:00:00.000Z",
    dimensionHash: "mock-account-1",
    ...overrides,
  };
}

describe("observeMetric", () => {
  it("returns lineage for a window that sits inside the range", () => {
    const observed = observeMetric({
      metricKey: "Spend",
      definition: spend,
      rows: [row(), row({ periodStart: "2026-01-01T00:00:00.000Z", periodEnd: "2026-01-31T00:00:00.000Z", value: 2550 })],
      range,
      now,
    });
    expect(observed).toMatchObject({
      status: "ok",
      value: 2550,
      source: "mock",
      definitionVersion: "1",
      fetchedAt: "2026-04-01T15:00:00.000Z",
      scopes: ["mock-account-1"],
    });
    expect(observed.windows).toEqual([{ start: "2026-03-02T00:00:00.000Z", end: "2026-04-01T00:00:00.000Z" }]);
  });

  it("refuses a value that has no definition version", () => {
    const observed = observeMetric({
      metricKey: "mock.spend",
      definition: { key: "mock.spend", source: "mock" },
      rows: [row({ definitionVersion: "  " })],
      range,
      now,
    });
    expect(observed.status).toBe("no_data");
    expect(observed.value).toBeNull();
    expect(observed.definitionVersion).toBeNull();
  });
});
