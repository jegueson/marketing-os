import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadMetricsYaml } from "./index";
import { buildKpiCards } from "./kpi";

const definitions = loadMetricsYaml(
  join(dirname(fileURLToPath(import.meta.url)), "../../../customer-configs/_templates/metrics.yaml"),
).definitions;

const fetchedAt = "2026-11-11T12:00:00.000Z";

function point(value: number, definitionVersion = "1") {
  return { value, definitionVersion, fetchedAt };
}

const current = {
  "mock.spend": point(100),
  "mock.sessions": point(50),
  "mock.leads": point(10),
  "ga4.key_events": point(7),
  "google_ads.conversions": point(3),
  "hubspot.deals_qualified": point(2),
};

describe("buildKpiCards", () => {
  it("builds the eight platform KPIs with lineage, target, and delta", () => {
    const cards = buildKpiCards({
      definitions,
      current,
      previous: {
        "mock.spend": point(80),
        "mock.sessions": point(40),
        "mock.leads": point(8),
        "ga4.key_events": point(5),
        "google_ads.conversions": point(2),
        "hubspot.deals_qualified": point(1),
      },
      now: new Date(fetchedAt),
    });
    expect(cards.map((card) => card.key).sort()).toEqual([
      "AdsConversions",
      "CostPerSession",
      "KeyEvents",
      "LeadCAC",
      "Leads",
      "QualifiedLeadCAC",
      "Sessions",
      "Spend",
    ]);
    const spend = cards.find((card) => card.key === "Spend");
    expect(spend).toMatchObject({
      value: 100,
      previous: 80,
      delta: 20,
      target: null,
      source: "mock",
      freshness: "live",
      definitionVersion: "1",
    });
    expect(spend?.widgets).toEqual(["executive", "performance"]);
    const leadCac = cards.find((card) => card.key === "LeadCAC");
    const qualified = cards.find((card) => card.key === "QualifiedLeadCAC");
    expect(leadCac?.value).toBe(10);
    expect(qualified?.value).toBe(50);
    expect(leadCac?.target).toBe(40);
    expect(leadCac?.value).not.toBe(qualified?.value);
  });

  it("refuses a KPI whose source has no definition version", () => {
    const cards = buildKpiCards({
      definitions,
      current: { ...current, "mock.spend": { value: 100, definitionVersion: "" } },
      now: new Date(fetchedAt),
    });
    expect(cards.find((card) => card.key === "Spend")).toBeUndefined();
    expect(cards.find((card) => card.key === "Sessions")?.definitionVersion).toBe("1");
  });
});
