import { and, eq, sql } from "drizzle-orm";
import { GA4_METRICS } from "@marketing-os/connector-google-analytics";
import { GOOGLE_ADS_METRICS } from "@marketing-os/connector-google-ads";
import { HUBSPOT_METRICS } from "@marketing-os/connector-hubspot";
import { META_METRICS } from "@marketing-os/connector-meta";
import { ConnectorError, type Connector } from "@marketing-os/connector-sdk";
import { assessDataHealth, planBackfillWindows, planSyncJobs, type KeyRing } from "@marketing-os/core";
import {
  connections,
  connectors,
  dataHealth,
  dataScopes,
  metricValues,
  selectRows,
  syncCursors,
  syncRuns,
  withContext,
  type Database,
} from "@marketing-os/db";
import { systemContext } from "../context";
import { loadConnectionCredentials } from "../lib/credentials";

const DAY_MS = 24 * 60 * 60 * 1000;
const MOCK_METRICS = [
  "mock.spend",
  "mock.sessions",
  "mock.leads",
  "mock.qualified_leads",
  "ga4.key_events",
  "google_ads.conversions",
  "hubspot.deals_qualified",
] as const;

function metricsFor(slug: string): readonly string[] {
  if (slug === "google-analytics") return GA4_METRICS;
  if (slug === "google-ads") return GOOGLE_ADS_METRICS;
  if (slug === "hubspot") return HUBSPOT_METRICS;
  if (slug === "meta") return META_METRICS;
  return MOCK_METRICS;
}

function credentialsFor(slug: string, stored: Record<string, string>, developerToken?: string): Record<string, string> {
  if (slug !== "google-ads" || !developerToken) return stored;
  return { ...stored, developer_token: developerToken };
}

export type SyncMessage = {
  runId: number;
  connectionId: string;
  tenantId: string;
  workspaceId: string;
};

export type SyncProducer = {
  sendBatch(messages: SyncMessage[]): Promise<void>;
};

type DueConnection = {
  id: string;
  tenantId: string;
  workspaceId: string;
  connectorSlug: string;
  cursor: string | null;
};

export async function createSyncRuns(tx: Database, connection: DueConnection, now = new Date()): Promise<SyncMessage[]> {
  const [scopes] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(dataScopes)
    .where(and(eq(dataScopes.connectionId, connection.id), eq(dataScopes.isActive, true)));
  if (!scopes?.n) {
    const error = new Error("Select at least one account or resource before syncing");
    error.name = "NoScopes";
    throw error;
  }
  const windows = connection.cursor
    ? [{ start: connection.cursor, end: now.toISOString() }]
    : planBackfillWindows(now);
  const mode = connection.cursor ? "incremental" : "backfill";
  const messages: SyncMessage[] = [];
  for (const window of windows) {
    if (Date.parse(window.end) <= Date.parse(window.start)) continue;
    const [run] = await tx
      .insert(syncRuns)
      .values({
        tenantId: connection.tenantId,
        workspaceId: connection.workspaceId,
        connectionId: connection.id,
        status: "queued",
        mode,
        windowStart: new Date(window.start),
        windowEnd: new Date(window.end),
      })
      .returning({ id: syncRuns.id });
    if (!run) throw new Error("Sync run insert returned no row");
    messages.push({
      runId: run.id,
      connectionId: connection.id,
      tenantId: connection.tenantId,
      workspaceId: connection.workspaceId,
    });
  }
  return messages;
}

export async function enqueueDueSyncs(db: Database, now = new Date()): Promise<SyncMessage[]> {
  const due = await withContext(db, systemContext, async (tx) => {
    const rows = await selectRows<{
      id: string;
      tenant_id: string;
      workspace_id: string;
      connector_slug: string;
      cursor: string | null;
    }>(tx, sql`select * from app.due_sync_connections()`);
    const jobs = planSyncJobs(
      rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        workspaceId: row.workspace_id,
        connectorSlug: row.connector_slug,
        nextSyncAt: row.cursor ? new Date(Date.parse(row.cursor) + DAY_MS).toISOString() : new Date(0).toISOString(),
      })),
      now,
    );
    const byId = new Map(rows.map((row) => [row.id, row.cursor]));
    return jobs.map((job) => ({ job, cursor: byId.get(job.connectionId) ?? null }));
  });
  const messages: SyncMessage[] = [];
  for (const { job, cursor } of due) {
    const created = await withContext(db, { tenantId: job.tenantId, userId: null, staff: false }, (tx) =>
      createSyncRuns(
        tx,
        {
          id: job.connectionId,
          tenantId: job.tenantId,
          workspaceId: job.workspaceId,
          connectorSlug: job.connectorSlug,
          cursor,
        },
        now,
      ),
    );
    messages.push(...created);
  }
  return messages;
}

export async function consumeSyncMessage(
  db: Database,
  message: SyncMessage,
  registry: ReadonlyMap<string, Connector>,
  ring: KeyRing | null = null,
  developerToken?: string,
): Promise<"ack" | "retry"> {
  let outcome: "ack" | "retry" = "ack";
  await withContext(db, { tenantId: message.tenantId, userId: null, staff: false }, async (tx) => {
    const [run] = await tx.select().from(syncRuns).where(eq(syncRuns.id, message.runId));
    if (!run || run.connectionId !== message.connectionId || run.status === "succeeded") return;
    const [connection] = await tx
      .select({ slug: connectors.slug, tenantId: connections.tenantId })
      .from(connections)
      .innerJoin(connectors, eq(connectors.id, connections.connectorId))
      .where(eq(connections.id, run.connectionId));
    if (!connection || connection.tenantId !== message.tenantId) {
      await tx.update(syncRuns).set({ status: "failed", errorCode: "ownership", finishedAt: new Date() }).where(eq(syncRuns.id, run.id));
      return;
    }
    const connector = registry.get(connection.slug);
    if (!connector) {
      await tx.update(syncRuns).set({ status: "failed", errorCode: "unsupported", finishedAt: new Date() }).where(eq(syncRuns.id, run.id));
      return;
    }
    const scopes = await tx
      .select({ resourceId: dataScopes.resourceId })
      .from(dataScopes)
      .where(and(eq(dataScopes.connectionId, run.connectionId), eq(dataScopes.isActive, true)));
    if (scopes.length === 0) {
      await tx.update(syncRuns).set({ status: "failed", errorCode: "no_scopes_selected", finishedAt: new Date() }).where(eq(syncRuns.id, run.id));
      return;
    }
    const dimensionHash = scopes.map((scope) => scope.resourceId).sort().join("|");
    const metrics = metricsFor(connection.slug);
    try {
      const credentials = credentialsFor(
        connection.slug,
        await loadConnectionCredentials(tx, run.connectionId, ring),
        developerToken,
      );
      for (const metric of metrics) {
        const [result] = await connector.queryMetrics(
          { tenantId: message.tenantId, workspaceId: message.workspaceId, connectionId: message.connectionId, credentials },
          {
            metric,
            dimensions: scopes.map((scope) => scope.resourceId),
            from: new Date(run.windowStart).toISOString(),
            to: new Date(run.windowEnd).toISOString(),
          },
        );
        if (!result?.lineage.definitionVersion) throw new Error("Metric result has no definition version");
        await tx
          .insert(metricValues)
          .values({
            tenantId: message.tenantId,
            definitionKey: result.metric,
            definitionVersion: result.lineage.definitionVersion,
            periodStart: run.windowStart,
            periodEnd: run.windowEnd,
            dimensionHash,
            connectionId: message.connectionId,
            value: String(result.value),
            fetchedAt: new Date(result.lineage.fetchedAt),
          })
          .onConflictDoUpdate({
            target: [
              metricValues.tenantId,
              metricValues.definitionKey,
              metricValues.definitionVersion,
              metricValues.periodStart,
              metricValues.periodEnd,
              metricValues.dimensionHash,
            ],
            set: { value: String(result.value), fetchedAt: new Date(result.lineage.fetchedAt) },
          });
      }
      await tx.update(syncRuns).set({ status: "succeeded", finishedAt: new Date() }).where(eq(syncRuns.id, run.id));
      const health = assessDataHealth({
        connectionId: run.connectionId,
        lastSuccessAt: new Date().toISOString(),
        lastErrorAt: null,
        staleAfterSeconds: 24 * 60 * 60,
        recordCount: metrics.length,
        schemaState: "ok",
        issues: [],
      });
      await tx.insert(dataHealth).values({
        connectionId: run.connectionId,
        tenantId: message.tenantId,
        status: health.status,
        freshnessAt: new Date(),
        schemaState: "ok",
        recordCount: String(metrics.length),
        issues: health.issues,
        checkedAt: new Date(),
      });
      await tx
        .insert(syncCursors)
        .values({ connectionId: run.connectionId, tenantId: message.tenantId, cursor: new Date(run.windowEnd).toISOString() })
        .onConflictDoUpdate({
          target: syncCursors.connectionId,
          set: { cursor: new Date(run.windowEnd).toISOString(), updatedAt: new Date() },
        });
    } catch (err) {
      if (err instanceof ConnectorError && err.code === "rate_limited") {
        await tx
          .update(syncRuns)
          .set({ status: "queued", attempt: run.attempt + 1, errorCode: "rate_limited" })
          .where(eq(syncRuns.id, run.id));
        outcome = "retry";
        return;
      }
      const code = err instanceof ConnectorError ? err.code : "sync_failed";
      const schemaState = code === "api_version_error" ? "mismatch" : "ok";
      const health = assessDataHealth({
        connectionId: run.connectionId,
        lastSuccessAt: null,
        lastErrorAt: new Date().toISOString(),
        staleAfterSeconds: 24 * 60 * 60,
        recordCount: null,
        schemaState,
        issues: [{ code, message: err instanceof Error ? err.message : "Sync failed" }],
      });
      await tx.insert(dataHealth).values({
        connectionId: run.connectionId,
        tenantId: message.tenantId,
        status: health.status,
        freshnessAt: null,
        schemaState,
        recordCount: null,
        issues: health.issues,
        checkedAt: new Date(),
      });
      await tx
        .update(syncRuns)
        .set({ status: "failed", errorCode: code, finishedAt: new Date() })
        .where(eq(syncRuns.id, run.id));
    }
  });
  return outcome;
}

export async function consumeSyncBatch(
  db: Database,
  messages: readonly { body: SyncMessage; ack(): void; retry(): void }[],
  registry: ReadonlyMap<string, Connector>,
  ring: KeyRing | null = null,
  developerToken?: string,
): Promise<void> {
  for (const message of messages) {
    const outcome = await consumeSyncMessage(db, message.body, registry, ring, developerToken);
    if (outcome === "retry") message.retry();
    else message.ack();
  }
}
