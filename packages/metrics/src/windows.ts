/** Ask range presets resolved in UTC. `end` is exclusive. */

export type AskRangePreset = "last_7_days" | "last_30_days" | "this_month" | "last_month" | "previous_period";

export type UtcRange = {
  start: Date;
  end: Date;
};

export type CoverageStatus = "full" | "partial" | "no_data";

export type RangeCoverage = {
  status: CoverageStatus;
  requestedDays: number;
  coveredDays: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Verified from `planBackfillWindows` defaults: a first sync is 90 days ending at
 * UTC midnight, in 30-day chunks. Incremental sync is not a fixed width.
 */
export const SYNC_BACKFILL_DAYS = 90;
export const SYNC_BACKFILL_CHUNK_DAYS = 30;

export class MetricRangeError extends Error {
  readonly code: "future_range" | "missing_primary" | "invalid_range";

  constructor(code: MetricRangeError["code"], message: string) {
    super(message);
    this.name = "MetricRangeError";
    this.code = code;
  }
}

/** UTC midnight at the start of `now`'s UTC date. Today's partial day is excluded. */
export function utcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function assertNotFuture(range: UtcRange, now: Date): void {
  const today = utcMidnight(now).getTime();
  if (range.start.getTime() > today || range.end.getTime() > today) {
    throw new MetricRangeError("future_range", "Metric range extends into the future");
  }
}

function assertOrdered(range: UtcRange): void {
  if (range.start.getTime() > range.end.getTime()) {
    throw new MetricRangeError("invalid_range", "Metric range start is after its end");
  }
}

/**
 * Resolve a preset against `now`.
 * `previous_period` is the equal-length window immediately before `primary`.
 */
export function resolvePreset(preset: AskRangePreset, now: Date, primary?: UtcRange): UtcRange {
  const today = utcMidnight(now);
  if (preset === "previous_period") {
    if (!primary) {
      throw new MetricRangeError("missing_primary", "previous_period requires the primary range");
    }
    assertOrdered(primary);
    assertNotFuture(primary, now);
    const length = primary.end.getTime() - primary.start.getTime();
    const range = { start: new Date(primary.start.getTime() - length), end: new Date(primary.start.getTime()) };
    assertNotFuture(range, now);
    return range;
  }

  let range: UtcRange;
  if (preset === "last_7_days") range = { start: addDays(today, -7), end: today };
  else if (preset === "last_30_days") range = { start: addDays(today, -30), end: today };
  else if (preset === "this_month") {
    range = { start: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), end: today };
  } else {
    range = {
      start: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)),
      end: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)),
    };
  }
  assertOrdered(range);
  assertNotFuture(range, now);
  return range;
}

function fullUtcDays(range: UtcRange): number[] {
  const days: number[] = [];
  for (let cursor = range.start.getTime(); cursor + DAY_MS <= range.end.getTime(); cursor += DAY_MS) {
    days.push(cursor);
  }
  return days;
}

function windowContainsDay(window: UtcRange, dayStart: number): boolean {
  return window.start.getTime() <= dayStart && window.end.getTime() >= dayStart + DAY_MS;
}

/**
 * A stored sync window counts only when it lies entirely inside the range.
 * Each metric value is one aggregate for its whole window, so a partial overlap
 * cannot be sliced into days.
 */
export function coverRange(range: UtcRange, windows: readonly UtcRange[], now: Date): RangeCoverage {
  assertOrdered(range);
  assertNotFuture(range, now);
  const requested = fullUtcDays(range);
  const interior = windows.filter(
    (window) => window.start.getTime() >= range.start.getTime() && window.end.getTime() <= range.end.getTime(),
  );
  const covered = requested.filter((day) => interior.some((window) => windowContainsDay(window, day)));
  const requestedDays = requested.length;
  const coveredDays = covered.length;
  const status: CoverageStatus =
    requestedDays === 0 || coveredDays === 0 ? "no_data" : coveredDays === requestedDays ? "full" : "partial";
  return { status, requestedDays, coveredDays };
}
