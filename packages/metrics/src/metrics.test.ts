import { describe, expect, it } from "vitest";
import { evaluateFormula, registerDefinitions } from "./index";

describe("metrics semantic layer", () => {
  it("registers compatible definitions", () => {
    const defs = registerDefinitions(
      [],
      [{ key: "ctr", source: "google_ads", version: "1", label: "CTR", formula: "clicks/impressions" }],
    );
    expect(defs).toHaveLength(1);
  });

  it("refuses merging differing definitions", () => {
    expect(() =>
      registerDefinitions(
        [{ key: "ctr", source: "google_ads", version: "1", label: "CTR", formula: "clicks/impressions" }],
        [{ key: "ctr", source: "google_ads", version: "2", label: "CTR", formula: "clicks/(impressions+1)" }],
      ),
    ).toThrow(/Refusing to merge/);
  });

  it("evaluates safe formulas", () => {
    expect(evaluateFormula("clicks / impressions", { clicks: 10, impressions: 100 })).toBe(0.1);
  });
});
