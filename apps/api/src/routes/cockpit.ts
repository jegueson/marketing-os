import { Hono } from "hono";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { NotFoundError, ok } from "@marketing-os/core";
import { cockpitViewSchema, type CockpitView, type DataHealthItem } from "@marketing-os/schemas";
import { connections, connectors, dataHealth, workspaces } from "@marketing-os/db";
import { requirePrincipal } from "../auth/principal";
import { requireWorkspace } from "../auth/access";
import { run, tenantContext, type HonoEnv } from "../context";
import { parseUuidParam } from "../lib/http";

export const cockpitRoutes = new Hono<HonoEnv>();

const DAY_MS = 24 * 60 * 60 * 1000;
/** Data older than this shows as stale in the cockpit. */
const STALE_AFTER_MS = DAY_MS;

type HealthState = DataHealthItem["health"];

function healthOf(status: string | null, freshnessAt: Date | null, now: number): HealthState {
  if (status === "healthy") {
    return freshnessAt && now - freshnessAt.getTime() <= STALE_AFTER_MS ? "healthy" : "stale";
  }
  if (status === "error" || status === "stale") return status;
  return "unknown";
}

cockpitRoutes.get(
  "/api/v1/workspaces/:workspaceId/cockpit",
  requirePrincipal,
  requireWorkspace("cockpit:view"),
  async (c) => {
    const workspaceId = parseUuidParam(c, "workspaceId");
    const now = Date.now();
    const { workspace, rows } = await run(c, tenantContext(c), async (tx) => {
      const [workspace] = await tx
        .select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId));
      const latest = tx
        .select({
          connectionId: dataHealth.connectionId,
          status: dataHealth.status,
          freshnessAt: dataHealth.freshnessAt,
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
        })
        .from(connections)
        .innerJoin(connectors, eq(connectors.id, connections.connectorId))
        .leftJoin(latest, and(eq(latest.connectionId, connections.id), eq(latest.rank, 1)))
        .where(and(eq(connections.workspaceId, workspaceId), isNull(connections.deletedAt)))
        .orderBy(desc(connections.createdAt));
      return { workspace, rows };
    });
    if (!workspace) throw new NotFoundError("Workspace not found");

    const health: DataHealthItem[] = rows.map((row) => ({
      connectionId: row.id,
      connector: row.connector,
      displayName: row.displayName,
      status: row.status as DataHealthItem["status"],
      health: healthOf(row.healthStatus, row.freshnessAt ? new Date(row.freshnessAt) : null, now),
      scopes: row.scopes,
      lastHealthyAt: row.lastHealthyAt ? new Date(row.lastHealthyAt).toISOString() : null,
      message: row.errorMessage,
    }));
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
      empty_state:
        freshness === "empty"
          ? { message: "Connect a data source and select accounts to populate the cockpit." }
          : null,
    });
    return c.json(ok(view));
  },
);
