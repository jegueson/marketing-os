import { z } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";
import { NotFoundError, ok } from "@marketing-os/core";
import { workflows } from "@marketing-os/db";
import { requirePrincipal } from "../auth/principal";
import { requireWorkspace } from "../auth/access";
import { requireConfigEnabled } from "../auth/config-flag";
import { run, tenantContext } from "../context";
import {
  apiSuccessSchema,
  createRouter,
  defineRoute,
  errorResponses,
  jsonContent,
  jsonValueSchema,
  uuidPathParam,
} from "../lib/openapi";

export const workflowRoutes = createRouter();

const workspaceParams = z.object({ workspaceId: uuidPathParam("workspaceId") });

const workflowViewSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["draft", "published"]),
    activeVersion: z.number().int().nullable(),
    draft: jsonValueSchema,
  })
  .openapi("WorkflowView");

const collection = "/api/v1/workspaces/{workspaceId}/workflows";

const readMiddleware = [requirePrincipal, requireConfigEnabled, requireWorkspace("config:read")];

const listRoute = defineRoute({
  method: "get",
  path: collection,
  tags: ["Workflows"],
  security: [{ Bearer: [] }],
  middleware: readMiddleware,
  request: { params: workspaceParams },
  responses: {
    200: jsonContent(apiSuccessSchema(z.array(workflowViewSchema), "WorkflowListResponse"), "Workflows"),
    ...errorResponses(401, 403, 404, 422),
  },
});

function workspaceId(access: { workspaceId: string | null }): string {
  if (!access.workspaceId) throw new NotFoundError("Workspace not found");
  return access.workspaceId;
}

workflowRoutes.openapi(listRoute, async (c) => {
  const access = c.get("access");
  const workspace = workspaceId(access);
  const rows = await run(c, tenantContext(c), (tx) =>
    tx
      .select()
      .from(workflows)
      .where(and(eq(workflows.tenantId, access.tenantId), eq(workflows.workspaceId, workspace))),
  );
  return c.json(
    ok(
      rows.map((row) => ({
        id: row.id,
        status: row.status,
        activeVersion: row.activeVersion,
        draft: row.draft,
      })),
    ),
    200,
  );
});
