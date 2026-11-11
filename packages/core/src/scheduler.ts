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

export type HealthDimensionState = "healthy" | "stale" | "error" | "never_synced";

export type DataHealthIssue = { code: string; message: string };

export type DataHealth = {
  connectionId: string;
  status: DataHealthStatus;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  freshnessSeconds: number | null;
  dimensions: {
    freshness: HealthDimensionState;
    volume: HealthDimensionState;
    schema: HealthDimensionState;
    errors: HealthDimensionState;
    permissions: HealthDimensionState;
  };
  issues: DataHealthIssue[];
};

export function assessDataHealth(input: {
  connectionId: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  staleAfterSeconds: number;
  recordCount?: number | null;
  schemaState?: "ok" | "mismatch" | null;
  issues?: DataHealthIssue[];
  now?: Date;
}): DataHealth {
  const now = input.now ?? new Date();
  const issues = [...(input.issues ?? [])];
  let freshness: HealthDimensionState = "never_synced";
  let freshnessSeconds: number | null = null;
  if (input.lastSuccessAt) {
    freshnessSeconds = Math.floor((now.getTime() - new Date(input.lastSuccessAt).getTime()) / 1000);
    freshness = freshnessSeconds > input.staleAfterSeconds ? "stale" : "healthy";
  }

  const volume: HealthDimensionState = input.recordCount != null && input.recordCount <= 0 ? "error" : "healthy";
  if (volume === "error") issues.push({ code: "volume", message: "The latest sync stored no records" });

  const schema: HealthDimensionState = input.schemaState === "mismatch" ? "error" : "healthy";
  if (schema === "error") {
    issues.push({ code: "schema", message: "The provider schema no longer matches this connector" });
  }

  const permissions: HealthDimensionState = issues.some((issue) =>
    issue.code === "permission_changed" || issue.code === "access_revoked",
  )
    ? "error"
    : "healthy";

  const errors: HealthDimensionState =
    input.lastErrorAt && (!input.lastSuccessAt || new Date(input.lastErrorAt) > new Date(input.lastSuccessAt))
      ? "error"
      : "healthy";

  let status: DataHealthStatus = "healthy";
  if (permissions === "error" || schema === "error" || errors === "error" || volume === "error" || issues.length > 0 && !input.lastSuccessAt) {
    status = "error";
  } else if (!input.lastSuccessAt) {
    status = "never_synced";
  } else if (freshness === "stale") {
    status = "stale";
  }

  return {
    connectionId: input.connectionId,
    status,
    lastSuccessAt: input.lastSuccessAt,
    lastErrorAt: input.lastErrorAt,
    freshnessSeconds,
    dimensions: { freshness, volume, schema, errors, permissions },
    issues,
  };
}

export function deriveDataHealth(input: {
  connectionId: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  staleAfterSeconds: number;
  now?: Date;
}): DataHealth {
  return assessDataHealth(input);
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
