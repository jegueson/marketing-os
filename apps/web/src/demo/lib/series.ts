/**
 * Deterministic dummy time series. The demo must render identically on every
 * load, so all "random" data comes from a seeded generator anchored to a fixed date.
 */

export const DEMO_TODAY = new Date(Date.UTC(2026, 10, 10));

export type SeriesPoint = { date: string; value: number };

export type SeriesOptions = {
  points: number;
  start: number;
  end: number;
  /** Relative noise, e.g. 0.05 = ±5 %. */
  noise?: number;
  /** Relative weekday/weekend swing, e.g. 0.15 dips weekends by up to 15 %. */
  weekly?: number;
  seed: number;
};

/** Mulberry32: small, fast, good enough for chart noise. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function makeSeries(options: SeriesOptions): SeriesPoint[] {
  const { points, start, end, noise = 0, weekly = 0, seed } = options;
  if (points < 2) throw new RangeError("makeSeries needs at least two points");
  const rand = seededRandom(seed);
  const step = (end - start) / (points - 1);

  return Array.from({ length: points }, (_, i) => {
    const date = new Date(DEMO_TODAY);
    date.setUTCDate(DEMO_TODAY.getUTCDate() - (points - 1 - i));
    const trend = start + step * i;
    const weekend = [0, 6].includes(date.getUTCDay()) ? 1 - weekly : 1;
    // Keep the last point on trend so headline numbers match their sparkline.
    const jitter = i === points - 1 ? 1 : 1 + (rand() * 2 - 1) * noise;
    return {
      date: date.toISOString().slice(0, 10),
      value: Math.max(0, Math.round(trend * weekend * jitter * 100) / 100),
    };
  });
}

/** "Nov 10" style label for chart axes. */
export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IE", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
