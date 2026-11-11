import { z } from "@hono/zod-openapi";
import { and, eq, isNull } from "drizzle-orm";
import { AppError, NotFoundError, ok } from "@marketing-os/core";
import { connections, connectors, syncCursors } from "@marketing-os/db";
import { requireWorkspace } from "../auth/access";
import { run, tenantContext } from "../context";
import { parseUuidParam } from "../lib/http";
import { apiSuccessSchema, createRouter, defineRoute, errorResponses, jsonContent, uuidPathParam } from "../lib/openapi";
import { createSyncRuns } from "../sync/engine";

export const syncRoutes = createRouter();

const syncRoute = defineRoute({
  method: "post",
  path: "/api/v1/workspaces/{workspaceId}/connections/{id}/sync",
  tags: ["Integrations"],
  security: [{ Bearer: [] }],
  middleware: [requireWorkspace("integrations:manage")],
  request: {
    params: z.object({ workspaceId: uuidPathParam("workspaceId"), id: uuidPathParam("id") }),
  },
  responses: {
    202: jsonContent(
      apiSuccessSchema(z.object({ runs: z.number().int() }).openapi("SyncAccepted"), "SyncAcceptedResponse"),
      "Sync queued",
    ),
    ...errorResponses(401, 403, 404, 422),
  },
});

syncRoutes.openapi(syncRoute, async (c) => {
  const workspaceId = parseUuidParam(c, "workspaceId");
  const id = parseUuidParam(c, "id");
  const access = c.get("access");
  const messages = await run(c, tenantContext(c), async (tx) => {
    const [connection] = await tx
      .select({ id: connections.id, slug: connectors.slug, cursor: syncCursors.cursor })
      .from(connections)
      .innerJoin(connectors, eq(connectors.id, connections.connectorId))
      .leftJoin(syncCursors, eq(syncCursors.connectionId, connections.id))
      .where(and(eq(connections.id, id), eq(connections.workspaceId, workspaceId), isNull(connections.deletedAt)));
    if (!connection) throw new NotFoundError("Connection not found");
    try {
      return await createSyncRuns(tx, {
        id: connection.id,
        tenantId: access.tenantId,
        workspaceId,
        connectorSlug: connection.slug,
        cursor: connection.cursor,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "NoScopes") {
        throw new AppError("no_scopes_selected", "Select at least one account or resource before syncing", 422);
      }
      throw err;
    }
  });
  const queue = c.get("deps").syncQueue;
  if (queue && messages.length) await queue.sendBatch(messages);
  return c.json(ok({ runs: messages.length }), 202);
});
