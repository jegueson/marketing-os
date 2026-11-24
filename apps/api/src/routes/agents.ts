import { z } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";
import { NotFoundError, ok } from "@marketing-os/core";
import { agents, publishAgent, saveAgentDraft } from "@marketing-os/db";
import { requirePrincipal } from "../auth/principal";
import { requireWorkspace } from "../auth/access";
import { requireConfigEnabled } from "../auth/config-flag";
import { run, tenantContext } from "../context";
import { recordAudit } from "../lib/events";
import { loadToolCatalog } from "../lib/tool-catalog";
import {
  apiSuccessSchema,
  createRouter,
  defineRoute,
  errorResponses,
  jsonContent,
  jsonValueSchema,
  uuidPathParam,
} from "../lib/openapi";

export const agentRoutes = createRouter();

const workspaceParams = z.object({ workspaceId: uuidPathParam("workspaceId") });
const agentParams = z.object({
  workspaceId: uuidPathParam("workspaceId"),
  agentId: uuidPathParam("agentId"),
});

const agentViewSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["draft", "published"]),
    activeVersion: z.number().int().nullable(),
    draft: jsonValueSchema,
  })
  .openapi("AgentView");

const publishResultSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int(),
    status: z.literal("published"),
  })
  .openapi("AgentPublishResult");

const draftBodySchema = z.record(z.string(), z.unknown()).openapi("AgentDraftBody");

const collection = "/api/v1/workspaces/{workspaceId}/agents";
const item = `${collection}/{agentId}`;

const readMiddleware = [requirePrincipal, requireConfigEnabled, requireWorkspace("config:read")];
const writeMiddleware = [requirePrincipal, requireConfigEnabled, requireWorkspace("config:write")];

const listRoute = defineRoute({
  method: "get",
  path: collection,
  tags: ["Agents"],
  security: [{ Bearer: [] }],
  middleware: readMiddleware,
  request: { params: workspaceParams },
  responses: {
    200: jsonContent(apiSuccessSchema(z.array(agentViewSchema), "AgentListResponse"), "Agents"),
    ...errorResponses(401, 403, 404, 422),
  },
});

const createRoute = defineRoute({
  method: "post",
  path: collection,
  tags: ["Agents"],
  security: [{ Bearer: [] }],
  middleware: writeMiddleware,
  request: {
    params: workspaceParams,
    body: jsonContent(draftBodySchema, "Agent draft"),
  },
  responses: {
    200: jsonContent(apiSuccessSchema(agentViewSchema, "AgentCreatedResponse"), "Created agent draft"),
    ...errorResponses(401, 403, 404, 422),
  },
});

const getRoute = defineRoute({
  method: "get",
  path: item,
  tags: ["Agents"],
  security: [{ Bearer: [] }],
  middleware: readMiddleware,
  request: { params: agentParams },
  responses: {
    200: jsonContent(apiSuccessSchema(agentViewSchema, "AgentResponse"), "Agent draft"),
    ...errorResponses(401, 403, 404, 422),
  },
});

const putRoute = defineRoute({
  method: "put",
  path: item,
  tags: ["Agents"],
  security: [{ Bearer: [] }],
  middleware: writeMiddleware,
  request: {
    params: agentParams,
    body: jsonContent(draftBodySchema, "Agent draft"),
  },
  responses: {
    200: jsonContent(apiSuccessSchema(agentViewSchema, "AgentSavedResponse"), "Saved agent draft"),
    ...errorResponses(401, 403, 404, 422),
  },
});

const publishRoute = defineRoute({
  method: "post",
  path: `${item}/publish`,
  tags: ["Agents"],
  security: [{ Bearer: [] }],
  middleware: writeMiddleware,
  request: { params: agentParams },
  responses: {
    200: jsonContent(apiSuccessSchema(publishResultSchema, "AgentPublishedResponse"), "Published agent"),
    ...errorResponses(401, 403, 404, 422),
  },
});

function workspaceId(access: { workspaceId: string | null }): string {
  if (!access.workspaceId) throw new NotFoundError("Workspace not found");
  return access.workspaceId;
}

function toView(row: { id: string; status: "draft" | "published"; activeVersion: number | null; draft: unknown }) {
  return {
    id: row.id,
    status: row.status,
    activeVersion: row.activeVersion,
    draft: row.draft,
  };
}

agentRoutes.openapi(listRoute, async (c) => {
  const access = c.get("access");
  const workspace = workspaceId(access);
  const rows = await run(c, tenantContext(c), (tx) =>
    tx
      .select()
      .from(agents)
      .where(and(eq(agents.tenantId, access.tenantId), eq(agents.workspaceId, workspace))),
  );
  return c.json(ok(rows.map(toView)), 200);
});

agentRoutes.openapi(createRoute, async (c) => {
  const access = c.get("access");
  const workspace = workspaceId(access);
  const saved = await run(c, tenantContext(c), (tx) =>
    saveAgentDraft(tx, {
      tenantId: access.tenantId,
      workspaceId: workspace,
      draft: c.req.valid("json"),
    }),
  );
  return c.json(ok(toView(saved)), 200);
});

agentRoutes.openapi(getRoute, async (c) => {
  const { agentId } = c.req.valid("param");
  const access = c.get("access");
  const workspace = workspaceId(access);
  const [row] = await run(c, tenantContext(c), (tx) =>
    tx
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.id, agentId),
          eq(agents.tenantId, access.tenantId),
          eq(agents.workspaceId, workspace),
        ),
      ),
  );
  if (!row) throw new NotFoundError("Agent not found");
  return c.json(ok(toView(row)), 200);
});

agentRoutes.openapi(putRoute, async (c) => {
  const { agentId } = c.req.valid("param");
  const access = c.get("access");
  const workspace = workspaceId(access);
  const saved = await run(c, tenantContext(c), (tx) =>
    saveAgentDraft(tx, {
      tenantId: access.tenantId,
      workspaceId: workspace,
      id: agentId,
      draft: c.req.valid("json"),
    }),
  );
  return c.json(ok(toView(saved)), 200);
});

agentRoutes.openapi(publishRoute, async (c) => {
  const { agentId } = c.req.valid("param");
  const access = c.get("access");
  const principal = c.get("principal");
  const workspace = workspaceId(access);
  const catalog = await loadToolCatalog(c.get("deps").connectors, access.tenantId, workspace);
  const published = await run(c, tenantContext(c), async (tx) => {
    const result = await publishAgent(tx, {
      tenantId: access.tenantId,
      workspaceId: workspace,
      id: agentId,
      publishedBy: principal.userId,
      catalog,
    });
    await recordAudit(tx, {
      eventType: "config.agent_published",
      tenantId: access.tenantId,
      workspaceId: workspace,
      actorId: principal.userId,
      actorRole: access.role,
      requestId: c.get("requestId"),
      resourceType: "agent",
      resourceId: result.agentId,
      payload: { version: result.version },
    });
    return result;
  });
  return c.json(ok({ id: published.agentId, version: published.version, status: "published" as const }), 200);
});
