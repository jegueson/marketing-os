import { describe, expect, it } from "vitest";
import { coverRange, MetricRangeError, resolvePreset, type UtcRange } from "./windows";

const now = new Date("2026-04-15T18:30:00.000Z");

function range(start: string, end: string): UtcRange {
  return { start: new Date(start), end: new Date(end) };
}

describe("metric range presets", () => {
  it("resolves preset boundaries in UTC, with end exclusive", () => {
    expect(resolvePreset("last_7_days", now)).toEqual(range("2026-04-08T00:00:00.000Z", "2026-04-15T00:00:00.000Z"));
    expect(resolvePreset("last_30_days", now)).toEqual(range("2026-03-16T00:00:00.000Z", "2026-04-15T00:00:00.000Z"));
    expect(resolvePreset("this_month", now)).toEqual(range("2026-04-01T00:00:00.000Z", "2026-04-15T00:00:00.000Z"));
    expect(resolvePreset("last_month", now)).toEqual(range("2026-03-01T00:00:00.000Z", "2026-04-01T00:00:00.000Z"));

    const last7 = resolvePreset("last_7_days", now);
    expect(resolvePreset("previous_period", now, last7)).toEqual(
      range("2026-04-01T00:00:00.000Z", "2026-04-08T00:00:00.000Z"),
    );
  });

  it("snaps a mid-month instant to UTC midnight and keeps February in a leap year", () => {
    const monthStart = new Date("2026-03-01T00:30:00.000Z");
    expect(resolvePreset("this_month", monthStart)).toEqual(
      range("2026-03-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z"),
    );
    expect(resolvePreset("last_month", new Date("2024-03-01T12:00:00.000Z"))).toEqual(
      range("2024-02-01T00:00:00.000Z", "2024-03-01T00:00:00.000Z"),
    );
  });

  it("aligns last_30_days with the newest 30-day backfill chunk", () => {
    const backfillNow = new Date("2026-04-01T15:00:00.000Z");
    expect(resolvePreset("last_30_days", backfillNow)).toEqual(
      range("2026-03-02T00:00:00.000Z", "2026-04-01T00:00:00.000Z"),
    );
  });

  it("counts a window only when it sits fully inside the range", () => {
    const requested = resolvePreset("last_30_days", new Date("2026-04-01T15:00:00.000Z"));
    const chunks = [
      range("2026-01-01T00:00:00.000Z", "2026-01-31T00:00:00.000Z"),
      range("2026-01-31T00:00:00.000Z", "2026-03-02T00:00:00.000Z"),
      range("2026-03-02T00:00:00.000Z", "2026-04-01T00:00:00.000Z"),
    ];
    expect(coverRange(requested, chunks, new Date("2026-04-01T15:00:00.000Z"))).toEqual({
      status: "full",
      requestedDays: 30,
      coveredDays: 30,
    });
  });

  it("reports partial coverage when contained windows miss some days", () => {
    const requested = resolvePreset("last_7_days", now);
    const inside = [range("2026-04-08T00:00:00.000Z", "2026-04-10T00:00:00.000Z")];
    expect(coverRange(requested, inside, now)).toEqual({
      status: "partial",
      requestedDays: 7,
      coveredDays: 2,
    });
  });

  it("reports no_data when the only window overlaps without being contained", () => {
    const requested = resolvePreset("last_7_days", new Date("2026-04-01T15:00:00.000Z"));
    const overlappingChunk = [range("2026-03-02T00:00:00.000Z", "2026-04-01T00:00:00.000Z")];
    expect(coverRange(requested, overlappingChunk, new Date("2026-04-01T15:00:00.000Z"))).toEqual({
      status: "no_data",
      requestedDays: 7,
      coveredDays: 0,
    });
  });

  it("rejects a range that extends into the future", () => {
    expect(() =>
      coverRange(range("2026-04-16T00:00:00.000Z", "2026-04-17T00:00:00.000Z"), [], now),
    ).toThrow(MetricRangeError);
    expect(() => resolvePreset("previous_period", now)).toThrow(MetricRangeError);
  });
});
