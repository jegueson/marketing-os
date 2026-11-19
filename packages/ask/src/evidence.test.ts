import { describe, expect, it } from "vitest";
import type { ToolResult } from "@marketing-os/schemas";
import { buildEvidence, type EvidenceInput } from "./evidence";

const input: EvidenceInput = {
  workspaceId: "00000000-0000-4000-8000-000000000010",
  preset: "last_30_days",
  from: "2026-03-02",
  to: "2026-04-01",
  labels: { "mock.spend": "Spend", "mock.sessions": "Sessions" },
  displayNames: {
    "00000000-0000-4000-8000-000000000001": "Mock ads",
    "00000000-0000-4000-8000-000000000002": "Mock site",
  },
};

const connection = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";

function health(id: string, healthStatus: "healthy" | "stale" | "error" | "never_synced"): ToolResult {
  return {
    stepId: "health",
    tool: "data_health",
    status: "ok",
    items: [{ connectionId: id, connector: "mock", health: healthStatus, message: null }],
  };
}

function spend(coverage?: { requestedDays: number; coveredDays: number }): ToolResult {
  return {
    stepId: "spend",
    tool: "metric_value",
    status: "ok",
    value: 2550,
    unit: "EUR",
    definitionKey: "mock.spend",
    definitionVersion: "1",
    source: "mock",
    fetchedAt: "2026-04-01T15:00:00.000Z",
    ...(coverage ? { coverage } : {}),
  };
}

describe("buildEvidence", () => {
  it("warns when a source is stale", () => {
    const evidence = buildEvidence([health(connection, "stale"), spend()], input);
    expect(evidence.qualityWarnings).toContain("stale");
    expect(evidence.freshness).toBe("stale");
  });

  it("warns when a source was never synced", () => {
    const evidence = buildEvidence([health(connection, "never_synced")], input);
    expect(evidence.qualityWarnings).toContain("never_synced");
    expect(evidence.freshness).toBe("empty");
  });

  it("warns on partial coverage", () => {
    const evidence = buildEvidence(
      [health(connection, "healthy"), spend({ requestedDays: 30, coveredDays: 10 })],
      input,
    );
    expect(evidence.qualityWarnings).toContain("partial coverage");
    expect(evidence.observed[0]?.value).toBe(2550);
  });

  it("warns on no data and records no number", () => {
    const evidence = buildEvidence(
      [{ stepId: "spend", tool: "metric_value", status: "no_data", definitionKey: "mock.spend", message: "No versioned value in range" }],
      input,
    );
    expect(evidence.qualityWarnings).toContain("no data");
    expect(evidence.observed).toEqual([]);
    expect(evidence.freshness).toBe("empty");
  });

  it("warns on an unresolved metric and does not invent a value", () => {
    const evidence = buildEvidence(
      [{ stepId: "spend", tool: "metric_value", status: "error", message: "Timed out" }],
      input,
    );
    expect(evidence.qualityWarnings).toContain("unresolved metric");
    expect(evidence.observed).toEqual([]);
    expect(JSON.stringify(evidence.observed)).not.toContain("2550");
  });

  it("keeps interpretation out of observed facts and always sets freshness", () => {
    const evidence = buildEvidence([health(connection, "healthy"), spend()], input);
    expect(evidence.freshness).toBe("live");
    expect(evidence.observed.every((fact) => !("interpretation" in fact))).toBe(true);
    expect(JSON.stringify(evidence)).not.toMatch(/"interpretation"/);
  });

  it("matches the golden fixture", () => {
    const evidence = buildEvidence(
      [
        {
          stepId: "health",
          tool: "data_health",
          status: "ok",
          items: [
            { connectionId: other, connector: "mock", health: "never_synced", message: null },
            { connectionId: connection, connector: "mock", health: "stale", message: "Late" },
          ],
        },
        spend({ requestedDays: 30, coveredDays: 10 }),
        {
          stepId: "sessions",
          tool: "metric_compare",
          status: "ok",
          current: 340,
          previous: 300,
          delta: 40,
          unit: "count",
          definitionKey: "mock.sessions",
          definitionVersion: "1",
          source: "mock",
          fetchedAt: "2026-04-01T15:00:00.000Z",
          coverage: { requestedDays: 30, coveredDays: 30 },
        },
        { stepId: "leads", tool: "metric_value", status: "no_data", message: "No versioned value in range" },
        { stepId: "cac", tool: "metric_value", status: "error", message: "Step failed" },
      ],
      input,
    );
    expect(evidence).toMatchInlineSnapshot(`
      {
        "assumptions": [
          "Values are UTC window aggregates.",
        ],
        "definitions": [
          {
            "key": "mock.sessions",
            "label": "Sessions",
            "version": "1",
          },
          {
            "key": "mock.spend",
            "label": "Spend",
            "version": "1",
          },
        ],
        "filters": {
          "workspaceId": "00000000-0000-4000-8000-000000000010",
        },
        "freshness": "stale",
        "observed": [
          {
            "definitionKey": "mock.spend",
            "definitionVersion": "1",
            "label": "Spend",
            "ref": "o1",
            "stepId": "spend",
            "unit": "EUR",
            "value": 2550,
          },
          {
            "definitionKey": "mock.sessions",
            "definitionVersion": "1",
            "label": "Sessions",
            "ref": "o2",
            "stepId": "sessions",
            "unit": "count",
            "value": 340,
          },
          {
            "definitionKey": "mock.sessions",
            "definitionVersion": "1",
            "label": "Sessions previous period",
            "ref": "o3",
            "stepId": "sessions",
            "unit": "count",
            "value": 300,
          },
        ],
        "qualityWarnings": [
          "stale",
          "never_synced",
          "partial coverage",
          "no data",
          "unresolved metric",
        ],
        "range": {
          "from": "2026-03-02",
          "label": "Last 30 days",
          "preset": "last_30_days",
          "to": "2026-04-01",
        },
        "sources": [
          {
            "connectionId": "00000000-0000-4000-8000-000000000001",
            "connector": "mock",
            "displayName": "Mock ads",
          },
          {
            "connectionId": "00000000-0000-4000-8000-000000000002",
            "connector": "mock",
            "displayName": "Mock site",
          },
        ],
      }
    `);
  });
});
