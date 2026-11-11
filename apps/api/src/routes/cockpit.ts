import { z } from "@hono/zod-openapi";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { NotFoundError, assessDataHealth, ok } from "@marketing-os/core";
import { cockpitViewSchema, type CockpitView, type DataHealthItem } from "@marketing-os/schemas";
import { connections, connectors, dataHealth, metricValues, workspaces } from "@marketing-os/db";
import { requirePrincipal } from "../auth/principal";
import { requireWorkspace } from "../auth/access";
import { run, tenantContext } from "../context";
import { parseUuidParam } from "../lib/http";
import { apiSuccessSchema, createRouter, defineRoute, errorResponses, jsonContent, uuidPathParam } from "../lib/openapi";

export const cockpitRoutes = createRouter();

const cockpitRoute = defineRoute({
  method: "get",
  path: "/api/v1/workspaces/{workspaceId}/cockpit",
  tags: ["Cockpit"],
  security: [{ Bearer: [] }],
  middleware: [requirePrincipal, requireWorkspace("cockpit:view")],
  request: { params: z.object({ workspaceId: uuidPathParam("workspaceId") }) },
  responses: {
    200: jsonContent(apiSuccessSchema(cockpitViewSchema, "CockpitResponse"), "Cockpit view"),
    ...errorResponses(401, 403, 404, 422),
  },
});

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_AFTER_SECONDS = 24 * 60 * 60;

cockpitRoutes.openapi(cockpitRoute, async (c) => {
    const workspaceId = parseUuidParam(c, "workspaceId");
    const now = Date.now();
    const { workspace, rows, metrics } = await run(c, tenantContext(c), async (tx) => {
      const [workspace] = await tx
        .select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId));
      const latest = tx
        .select({
          connectionId: dataHealth.connectionId,
          status: dataHealth.status,
          freshnessAt: dataHealth.freshnessAt,
          schemaState: dataHealth.schemaState,
          recordCount: dataHealth.recordCount,
          issues: dataHealth.issues,
          rank: sql<number>`row_number() over (partition by ${dataHealth.connectionId} order by ${dataHealth.checkedAt} desc)`.as("rank"),
        })
        .from(dataHealth)
        .as("latest");
      const rows = await tx
        .select({
          id: connections.id,
          connector: connectors.slug,
          displayName: connections.displayName,
          status: connections.status,
          errorMessage: connections.errorMessage,
          lastHealthyAt: connections.lastHealthyAt,
          scopes: sql<number>`(select count(*)::int from data_scopes s where s.connection_id = ${connections.id} and s.is_active)`,
          healthStatus: latest.status,
          freshnessAt: latest.freshnessAt,
          schemaState: latest.schemaState,
          recordCount: latest.recordCount,
          issues: latest.issues,
        })
        .from(connections)
        .innerJoin(connectors, eq(connectors.id, connections.connectorId))
        .leftJoin(latest, and(eq(latest.connectionId, connections.id), eq(latest.rank, 1)))
        .where(and(eq(connections.workspaceId, workspaceId), isNull(connections.deletedAt)))
        .orderBy(desc(connections.createdAt));
      const stored = await tx
        .select({
          key: metricValues.definitionKey,
          value: metricValues.value,
          definitionVersion: metricValues.definitionVersion,
          fetchedAt: metricValues.fetchedAt,
        })
        .from(metricValues)
        .innerJoin(connections, eq(connections.id, metricValues.connectionId))
        .where(eq(connections.workspaceId, workspaceId))
        .orderBy(desc(metricValues.fetchedAt));
      const seen = new Set<string>();
      const metrics = stored.flatMap((row) => {
        if (seen.has(row.key) || !row.definitionVersion) return [];
        seen.add(row.key);
        return [{
          key: row.key,
          value: row.value,
          definitionVersion: row.definitionVersion,
          source: row.key.split(".")[0] ?? "mock",
          fetchedAt: new Date(row.fetchedAt).toISOString(),
        }];
      });
      return { workspace, rows, metrics };
    });
    if (!workspace) throw new NotFoundError("Workspace not found");

    const health: DataHealthItem[] = rows.map((row) => {
      const issues = Array.isArray(row.issues)
        ? row.issues.flatMap((issue) => {
            if (!issue || typeof issue !== "object") return [];
            const code = "code" in issue && typeof issue.code === "string" ? issue.code : "";
            const message = "message" in issue && typeof issue.message === "string" ? issue.message : "";
            return code ? [{ code, message }] : [];
          })
        : [];
      const report = assessDataHealth({
        connectionId: row.id,
        lastSuccessAt: row.freshnessAt ? new Date(row.freshnessAt).toISOString() : null,
        lastErrorAt: row.healthStatus === "error" && row.freshnessAt ? new Date(row.freshnessAt).toISOString() : null,
        staleAfterSeconds: STALE_AFTER_SECONDS,
        recordCount: row.recordCount == null ? null : Number(row.recordCount),
        schemaState: row.schemaState === "mismatch" ? "mismatch" : row.schemaState === "ok" ? "ok" : null,
        issues,
        now: new Date(now),
      });
      return {
        connectionId: row.id,
        connector: row.connector,
        displayName: row.displayName,
        status: row.status as DataHealthItem["status"],
        health: report.status,
        scopes: row.scopes,
        lastHealthyAt: row.freshnessAt ? new Date(row.freshnessAt).toISOString() : row.lastHealthyAt ? new Date(row.lastHealthyAt).toISOString() : null,
        message: report.issues[0]?.message ?? row.errorMessage,
      };
    });
    const active = health.filter((h) => h.status === "active");
    const freshness: CockpitView["header"]["freshness"] =
      active.length === 0 ? "empty" : active.some((h) => h.health === "healthy") ? "live" : "stale";

    const view: CockpitView = cockpitViewSchema.parse({
      header: {
        workspaceId,
        workspaceName: workspace.name,
        period: {
          from: new Date(now - 30 * DAY_MS).toISOString(),
          to: new Date(now).toISOString(),
          label: "Last 30 days",
        },
        freshness,
      },
      kpi_cards: [],
      attention_queue: [],
      recommendations: [],
      data_health: health,
      metrics,
      empty_state:
        freshness === "empty"
          ? { message: "Connect a data source and select accounts to populate the cockpit." }
          : null,
    });
    return c.json(ok(view), 200);
  });
