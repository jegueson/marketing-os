import { describe, expect, it } from "vitest";
import { filterCreators, type CreatorFilterable } from "./filter-creators";

const CREATORS: readonly CreatorFilterable[] = [
  { name: "Nora Klein", niche: "B2B SaaS", platform: "LinkedIn", minFollowers: 42_000, country: "DE" },
  { name: "Jules Martin", niche: "Productivity", platform: "YouTube", minFollowers: 180_000, country: "FR" },
  { name: "Aya Rahman", niche: "B2B SaaS", platform: "TikTok", minFollowers: 95_000, country: "NL" },
  { name: "Sam Ortega", niche: "DevTools", platform: "LinkedIn", minFollowers: 28_000, country: "ES" },
];

describe("filterCreators", () => {
  it("returns all when the filter is empty", () => {
    expect(filterCreators(CREATORS, {})).toHaveLength(4);
  });

  it("matches query against name or niche", () => {
    expect(filterCreators(CREATORS, { query: "nora" }).map((c) => c.name)).toEqual(["Nora Klein"]);
    expect(filterCreators(CREATORS, { query: "devtools" }).map((c) => c.name)).toEqual(["Sam Ortega"]);
  });

  it("filters by niche, platform and country", () => {
    expect(filterCreators(CREATORS, { niche: "B2B SaaS" })).toHaveLength(2);
    expect(filterCreators(CREATORS, { platform: "LinkedIn" })).toHaveLength(2);
    expect(filterCreators(CREATORS, { country: "FR" }).map((c) => c.name)).toEqual(["Jules Martin"]);
  });

  it("treats all as a no-op for enum filters", () => {
    expect(filterCreators(CREATORS, { niche: "all", platform: "ALL", country: "All" })).toHaveLength(4);
  });

  it("applies minFollowers as a lower bound", () => {
    expect(filterCreators(CREATORS, { minFollowers: 90_000 })).toHaveLength(2);
  });

  it("combines filters with AND", () => {
    expect(filterCreators(CREATORS, { niche: "B2B SaaS", platform: "TikTok", minFollowers: 50_000 }).map((c) => c.name)).toEqual([
      "Aya Rahman",
    ]);
  });
});
