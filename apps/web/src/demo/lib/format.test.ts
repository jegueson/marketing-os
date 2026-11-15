import { describe, expect, it } from "vitest";
import { formatCompactEur, formatEur, formatNumber, formatPercent, formatValue } from "./format";

describe("demo number formatting", () => {
  it("formats euros without decimals", () => {
    expect(formatEur(1840)).toBe("€1,840");
  });

  it("formats large euro values compactly", () => {
    expect(formatCompactEur(1_240_000)).toBe("€1.24M");
    expect(formatCompactEur(18_400)).toBe("€18.4K");
    expect(formatCompactEur(212)).toBe("€212");
  });

  it("formats plain numbers with thousands separators", () => {
    expect(formatNumber(12_480)).toBe("12,480");
  });

  it("signs percentages only when asked", () => {
    expect(formatPercent(18.44)).toBe("18.4%");
    expect(formatPercent(18.44, { signed: true })).toBe("+18.4%");
    expect(formatPercent(-6.3, { signed: true })).toBe("-6.3%");
    expect(formatPercent(0, { signed: true })).toBe("0.0%");
  });

  it("formats by value kind", () => {
    expect(formatValue(1_240_000, "eur")).toBe("€1.24M");
    expect(formatValue(842, "number")).toBe("842");
    expect(formatValue(4.2, "ratio")).toBe("4.2x");
    expect(formatValue(3.4, "percent")).toBe("3.4%");
    expect(formatValue(7.42, "decimal")).toBe("7.4");
  });
});
