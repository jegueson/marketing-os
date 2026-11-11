import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  evaluateCatalog,
  evaluateExpression,
  loadMetricsYaml,
  parseMetricsYaml,
  registerDefinitions,
  renderMetric,
  resolveCatalog,
  type MetricDefinition,
} from "./index";

const templatePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../customer-configs/_templates/metrics.yaml",
);

const ctr = (formula: MetricDefinition["formula"], version = "1"): MetricDefinition => ({
  key: "ctr",
  source: "google_ads",
  version,
  label: "CTR",
  ...(formula ? { formula } : {}),
});

describe("metrics semantic layer", () => {
  it("registers compatible definitions", () => {
    const defs = registerDefinitions([], [ctr({ op: "ratio", numerator: "clicks", denominator: "impressions" })]);
    expect(defs).toHaveLength(1);
  });

  it("refuses merging a different version or formula", () => {
    const current = ctr({ op: "ratio", numerator: "clicks", denominator: "impressions" });
    expect(() =>
      registerDefinitions(
        [current],
        [ctr({ op: "ratio", numerator: "clicks", denominator: "impressions" }, "2")],
      ),
    ).toThrow(/Refusing to merge/);
    expect(() =>
      registerDefinitions(
        [current],
        [ctr({ op: "ratio", numerator: "clicks", denominator: "clicks" })],
      ),
    ).toThrow(/Refusing to merge/);
  });

  it("evaluates only sum, ratio, and filter", () => {
    expect(evaluateExpression({ op: "sum", metric: "clicks" }, { clicks: 10 })).toBe(10);
    expect(
      evaluateExpression(
        { op: "ratio", numerator: "clicks", denominator: "impressions" },
        { clicks: 10, impressions: 100 },
      ),
    ).toBe(0.1);
    expect(
      evaluateExpression(
        { op: "filter", metric: "deals", field: "stage", equals: "qualified" },
        { deals: 4 },
        { stage: "qualified" },
      ),
    ).toBe(4);
    expect(() =>
      evaluateExpression(
        { op: "filter", metric: "deals", field: "stage", equals: "qualified" },
        { deals: 4 },
        { stage: "open" },
      ),
    ).toThrow(/Filter excluded/);
    expect(() => parseMetricsYaml("version: 1\ndefinitions:\n  - key: x\n    source: s\n    version: '1'\n    label: X\n    formula: clicks / impressions\n")).toThrow(/invalid/i);
  });

  it("keeps QualifiedLeadCAC distinct from LeadCAC", () => {
    const doc = loadMetricsYaml(templatePath);
    const values = evaluateCatalog(doc.definitions, {
      "mock.spend": 100,
      "mock.sessions": 50,
      "mock.leads": 10,
      "mock.qualified_leads": 2,
      "ga4.key_events": 7,
      "google_ads.conversions": 3,
      "hubspot.deals_qualified": 2,
      "hubspot.contacts_created": 10,
    });
    expect(values.LeadCAC).toBe(10);
    expect(values.QualifiedLeadCAC).toBe(50);
    expect(values.LeadCAC).not.toBe(values.QualifiedLeadCAC);
    expect(doc.definitions.map((definition) => definition.key)).toContain("QualifiedLeadCAC");
  });

  it("lets a tenant override replace a platform KPI without rewriting it", () => {
    const platform = loadMetricsYaml(templatePath).definitions;
    const override: MetricDefinition = {
      key: "LeadCAC",
      source: "formula",
      version: "1",
      label: "Lead CAC (tenant)",
      formula: { op: "ratio", numerator: "Spend", denominator: "QualifiedLeads" },
    };
    const resolved = resolveCatalog(platform, [override]);
    const lead = resolved.find((definition) => definition.key === "LeadCAC");
    expect(lead?.label).toBe("Lead CAC (tenant)");
    expect(platform.find((definition) => definition.key === "LeadCAC")?.label).toBe("Lead CAC");
  });

  it("refuses to render a number without a definition version", () => {
    expect(
      renderMetric({
        value: 1,
        lineage: { source: "mock", fetchedAt: "2026-11-11T00:00:00.000Z", definitionVersion: "1" },
      }),
    ).toBe(1);
    expect(() => renderMetric({ value: 1, lineage: null })).toThrow(/definition version/);
    expect(() =>
      renderMetric({
        value: 1,
        lineage: { source: "mock", fetchedAt: "2026-11-11T00:00:00.000Z", definitionVersion: "" },
      }),
    ).toThrow(/definition version/);
  });
});
