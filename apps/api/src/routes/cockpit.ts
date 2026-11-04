import { Hono } from "hono";
import { ok } from "@marketing-os/core";
import type { HonoEnv } from "../app";
import { requirePermission, requirePrincipal } from "../auth/principal";
import { memoryStore } from "../store/memory";

export const cockpitRoutes = new Hono<HonoEnv>();

cockpitRoutes.get(
  "/api/v1/workspaces/:workspaceId/cockpit",
  requirePrincipal,
  requirePermission("cockpit:view"),
  (c) => {
    const workspaceId = c.req.param("workspaceId");
    const workspace = memoryStore.workspaces.get(workspaceId);
    const connections = [...memoryStore.connections.values()].filter(
      (connection) => connection.workspaceId === workspaceId,
    );
    return c.json(
      ok({
        header: {
          workspaceId,
          workspaceName: workspace?.name ?? "Workspace",
          period: "last_30_days",
          freshness: connections.length ? "live" : "empty",
        },
        kpi_cards: [],
        attention_queue: [],
        recommendations: [],
        data_health: connections.map((connection) => ({
          connectionId: connection.id,
          connector: connection.connectorSlug,
          status: connection.status,
          scopes: connection.scopes.length,
        })),
        empty_state:
          connections.length === 0
            ? { message: "Connect a data source to populate the cockpit." }
            : null,
      }),
    );
  },
);
