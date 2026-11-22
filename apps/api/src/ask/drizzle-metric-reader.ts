import { and, eq, isNull, or } from "drizzle-orm";
import {
  observeMetric,
  type DataHealthReading,
  type ListedMetric,
  type MetricComparison,
  type MetricObservation,
  type MetricQuery,
  type MetricReader,
  type StoredMetricRow,
} from "@marketing-os/ask";
import { assessDataHealth } from "@marketing-os/core";
import { connections, connectors, dataHealth, dataScopes, metricDefinitions, metricValues, withReadOnly, type Database, type DbContext } from "@marketing-os/db";
import { resolveCatalog, type MetricDefinition } from "@marketing-os/metrics";
import { resolvePreset, type AskRangePreset } from "@marketing-os/metrics/windows";

const STALE_AFTER_SECONDS = 24 * 60 * 60;

export type MetricReaderScope = {
  tenantId: string;
  workspaceId: string;
  now?: Date;
};

function asDefinition(row: {
  key: string;
  source: string;
  version: string;
  label: string;
  unit: string | null;
  formula: unknown;
}): MetricDefinition {
  const formula =
    row.formula && typeof row.formula === "object" && "op" in row.formula
      ? (row.formula as MetricDefinition["formula"])
      : undefined;
  return {
    key: row.key,
    source: row.source,
    version: row.version,
    label: row.label,
    ...(row.unit ? { unit: row.unit } : {}),
    ...(formula ? { formula } : {}),
  };
}

export function createDrizzleMetricReader(db: Database, scope: MetricReaderScope): MetricReader {
  const ctx: DbContext = { tenantId: scope.tenantId, userId: null, staff: false };
  const now = () => scope.now ?? new Date();

  async function load(tx: Database): Promise<{ definitions: MetricDefinition[]; rows: StoredMetricRow[] }> {
    const definitionRows = await tx
      .select()
      .from(metricDefinitions)
      .where(or(isNull(metricDefinitions.tenantId), eq(metricDefinitions.tenantId, scope.tenantId)));
    const platform = definitionRows.filter((row) => row.tenantId == null).map(asDefinition);
    const overrides = definitionRows.filter((row) => row.tenantId === scope.tenantId).map(asDefinition);
    const stored = await tx
      .select({
        definitionKey: metricValues.definitionKey,
        definitionVersion: metricValues.definitionVersion,
        value: metricValues.value,
        fetchedAt: metricValues.fetchedAt,
        periodStart: metricValues.periodStart,
        periodEnd: metricValues.periodEnd,
        dimensionHash: metricValues.dimensionHash,
      })
      .from(metricValues)
      .innerJoin(connections, eq(connections.id, metricValues.connectionId))
      .where(and(eq(connections.workspaceId, scope.workspaceId), isNull(connections.deletedAt)));
    return {
      definitions: resolveCatalog(platform, overrides),
      rows: stored.map((row) => ({
        definitionKey: row.definitionKey,
        definitionVersion: row.definitionVersion,
        value: Number(row.value),
        fetchedAt: new Date(row.fetchedAt).toISOString(),
        periodStart: new Date(row.periodStart).toISOString(),
        periodEnd: new Date(row.periodEnd).toISOString(),
        dimensionHash: row.dimensionHash,
      })),
    };
  }

  function observation(query: MetricQuery, definitions: MetricDefinition[], rows: StoredMetricRow[], rangePreset: AskRangePreset, primary?: { start: Date; end: Date }): MetricObservation {
    const clock = now();
    const range = resolvePreset(rangePreset, clock, primary);
    return observeMetric({
      metricKey: query.metricKey,
      definition: definitions.find((definition) => definition.key === query.metricKey) ?? null,
      rows,
      range,
      now: clock,
    });
  }

  return {
    async metricValue(query) {
      return withReadOnly(db, ctx, async (tx) => {
        const { definitions, rows } = await load(tx);
        return observation(query, definitions, rows, query.range);
      });
    },
    async metricCompare(query): Promise<MetricComparison> {
      return withReadOnly(db, ctx, async (tx) => {
        const { definitions, rows } = await load(tx);
        const current = observation(query, definitions, rows, query.range);
        const primary = resolvePreset(query.range, now());
        const previous = observation(query, definitions, rows, "previous_period", primary);
        return {
          metricKey: query.metricKey,
          status: current.status,
          current: current.value,
          previous: previous.value,
          delta: current.value != null && previous.value != null ? current.value - previous.value : null,
          source: current.source,
          definitionVersion: current.definitionVersion,
          fetchedAt: current.fetchedAt,
          windows: [...current.windows, ...previous.windows],
          scopes: [...new Set([...current.scopes, ...previous.scopes])].sort(),
        };
      });
    },
    async dataHealth() {
      return withReadOnly(db, ctx, async (tx) => {
        const rows = await tx
          .select({
            id: connections.id,
            connector: connectors.slug,
            errorMessage: connections.errorMessage,
          })
          .from(connections)
          .innerJoin(connectors, eq(connectors.id, connections.connectorId))
          .where(and(eq(connections.workspaceId, scope.workspaceId), isNull(connections.deletedAt)));
        const healthRows = await tx.select().from(dataHealth).where(eq(dataHealth.tenantId, scope.tenantId));
        const scopeRows = await tx
          .select({ connectionId: dataScopes.connectionId, resourceId: dataScopes.resourceId })
          .from(dataScopes)
          .where(and(eq(dataScopes.tenantId, scope.tenantId), eq(dataScopes.isActive, true)));
        return rows.map((row): DataHealthReading => {
          const latest = healthRows
            .filter((health) => health.connectionId === row.id)
            .sort((left, right) => new Date(right.checkedAt).getTime() - new Date(left.checkedAt).getTime())[0];
          const issues = Array.isArray(latest?.issues)
            ? latest.issues.flatMap((issue) => {
                if (!issue || typeof issue !== "object") return [];
                const code = "code" in issue && typeof issue.code === "string" ? issue.code : "";
                const message = "message" in issue && typeof issue.message === "string" ? issue.message : "";
                return code ? [{ code, message }] : [];
              })
            : [];
          const report = assessDataHealth({
            connectionId: row.id,
            lastSuccessAt: latest?.freshnessAt ? new Date(latest.freshnessAt).toISOString() : null,
            lastErrorAt: latest?.status === "error" && latest.freshnessAt ? new Date(latest.freshnessAt).toISOString() : null,
            staleAfterSeconds: STALE_AFTER_SECONDS,
            recordCount: latest?.recordCount == null ? null : Number(latest.recordCount),
            schemaState: latest?.schemaState === "mismatch" ? "mismatch" : latest?.schemaState === "ok" ? "ok" : null,
            issues,
            now: now(),
          });
          return {
            connectionId: row.id,
            connector: row.connector,
            health: report.status,
            message: report.issues[0]?.message ?? row.errorMessage,
            scopes: scopeRows.filter((scope) => scope.connectionId === row.id).map((scope) => scope.resourceId).sort(),
          };
        });
      });
    },
    async listMetrics(): Promise<ListedMetric[]> {
      return withReadOnly(db, ctx, async (tx) => {
        const { definitions } = await load(tx);
        return definitions.map((definition) => ({
          key: definition.key,
          source: definition.source,
          version: definition.version,
          label: definition.label,
          unit: definition.unit ?? null,
        }));
      });
    },
  };
}
