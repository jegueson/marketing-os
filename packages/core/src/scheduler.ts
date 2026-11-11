import { z } from "zod";

export const syncJobSchema = z.object({
  connectionId: z.string().uuid(),
  tenantId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  connectorSlug: z.string(),
  cursor: z.string().nullable().default(null),
  scheduledFor: z.string().datetime(),
});

export type SyncJob = z.infer<typeof syncJobSchema>;

export type DataHealthStatus = "healthy" | "stale" | "error" | "never_synced";

export type DataHealth = {
  connectionId: string;
  status: DataHealthStatus;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  freshnessSeconds: number | null;
};

export function deriveDataHealth(input: {
  connectionId: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  staleAfterSeconds: number;
  now?: Date;
}): DataHealth {
  const now = input.now ?? new Date();
  if (!input.lastSuccessAt) {
    return {
      connectionId: input.connectionId,
      status: input.lastErrorAt ? "error" : "never_synced",
      lastSuccessAt: null,
      lastErrorAt: input.lastErrorAt,
      freshnessSeconds: null,
    };
  }
  const age = Math.floor((now.getTime() - new Date(input.lastSuccessAt).getTime()) / 1000);
  const status: DataHealthStatus =
    input.lastErrorAt && new Date(input.lastErrorAt) > new Date(input.lastSuccessAt)
      ? "error"
      : age > input.staleAfterSeconds
        ? "stale"
        : "healthy";
  return {
    connectionId: input.connectionId,
    status,
    lastSuccessAt: input.lastSuccessAt,
    lastErrorAt: input.lastErrorAt,
    freshnessSeconds: age,
  };
}

/** 90-day backfill split into contiguous chunks, oldest first. */
export function planBackfillWindows(now: Date, days = 90, chunkDays = 30): { start: string; end: string }[] {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = end - days * 24 * 60 * 60 * 1000;
  const windows: { start: string; end: string }[] = [];
  for (let cursor = start; cursor < end; ) {
    const next = Math.min(end, cursor + chunkDays * 24 * 60 * 60 * 1000);
    windows.push({ start: new Date(cursor).toISOString(), end: new Date(next).toISOString() });
    cursor = next;
  }
  return windows;
}

/** Exponential backoff for a rate-limited provider call, capped at one minute. */
export function rateLimitBackoffMs(attempt: number): number {
  return Math.min(60_000, 1000 * 2 ** Math.max(0, attempt));
}
export function planSyncJobs(
  connections: Array<{
    id: string;
    tenantId: string;
    workspaceId: string;
    connectorSlug: string;
    nextSyncAt: string;
  }>,
  now = new Date(),
): SyncJob[] {
  return connections
    .filter((c) => new Date(c.nextSyncAt) <= now)
    .map((c) =>
      syncJobSchema.parse({
        connectionId: c.id,
        tenantId: c.tenantId,
        workspaceId: c.workspaceId,
        connectorSlug: c.connectorSlug,
        cursor: null,
        scheduledFor: now.toISOString(),
      }),
    );
}
