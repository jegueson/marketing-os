import { describe, expect, it } from "vitest";
import { DEMO_TODAY, makeSeries, seededRandom } from "./series";

describe("seededRandom", () => {
  it("returns the same sequence for the same seed", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("stays inside [0, 1)", () => {
    const rand = seededRandom(7);
    for (let i = 0; i < 500; i += 1) {
      const value = rand();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("makeSeries", () => {
  it("is deterministic so screenshots and demos never change", () => {
    const options = { points: 30, start: 100, end: 160, noise: 0.05, seed: 3 };
    expect(makeSeries(options)).toEqual(makeSeries(options));
  });

  it("returns one point per day ending on the demo date", () => {
    const series = makeSeries({ points: 14, start: 10, end: 20, seed: 1 });
    expect(series).toHaveLength(14);
    expect(series.at(-1)?.date).toBe(DEMO_TODAY.toISOString().slice(0, 10));
  });

  it("moves from start toward end and never goes negative", () => {
    const series = makeSeries({ points: 60, start: 50, end: 200, noise: 0.02, seed: 9 });
    expect(series[0]!.value).toBeLessThan(series.at(-1)!.value);
    expect(series.every((point) => point.value >= 0)).toBe(true);
  });

  it("rejects fewer than two points", () => {
    expect(() => makeSeries({ points: 1, start: 1, end: 2, seed: 1 })).toThrow(RangeError);
  });
});
