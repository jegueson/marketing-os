import { z } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";
import { NotFoundError, ok } from "@marketing-os/core";
import { publishSkill, saveSkillDraft, skills } from "@marketing-os/db";
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

export const skillRoutes = createRouter();

const workspaceParams = z.object({ workspaceId: uuidPathParam("workspaceId") });
const skillParams = z.object({
  workspaceId: uuidPathParam("workspaceId"),
  skillId: uuidPathParam("skillId"),
});

const skillViewSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["draft", "published"]),
    activeVersion: z.number().int().nullable(),
    draft: jsonValueSchema,
  })
  .openapi("SkillView");

const publishResultSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int(),
    status: z.literal("published"),
  })
  .openapi("SkillPublishResult");

const draftBodySchema = z.record(z.string(), z.unknown()).openapi("SkillDraftBody");

const collection = "/api/v1/workspaces/{workspaceId}/skills";
const item = `${collection}/{skillId}`;

const readMiddleware = [requirePrincipal, requireConfigEnabled, requireWorkspace("config:read")];
const writeMiddleware = [requirePrincipal, requireConfigEnabled, requireWorkspace("config:write")];

const listRoute = defineRoute({
  method: "get",
  path: collection,
  tags: ["Skills"],
  security: [{ Bearer: [] }],
  middleware: readMiddleware,
  request: { params: workspaceParams },
  responses: {
    200: jsonContent(apiSuccessSchema(z.array(skillViewSchema), "SkillListResponse"), "Skills"),
    ...errorResponses(401, 403, 404, 422),
  },
});

const createRoute = defineRoute({
  method: "post",
  path: collection,
  tags: ["Skills"],
  security: [{ Bearer: [] }],
  middleware: writeMiddleware,
  request: {
    params: workspaceParams,
    body: jsonContent(draftBodySchema, "Skill draft"),
  },
  responses: {
    200: jsonContent(apiSuccessSchema(skillViewSchema, "SkillCreatedResponse"), "Created skill draft"),
    ...errorResponses(401, 403, 404, 422),
  },
});

const getRoute = defineRoute({
  method: "get",
  path: item,
  tags: ["Skills"],
  security: [{ Bearer: [] }],
  middleware: readMiddleware,
  request: { params: skillParams },
  responses: {
    200: jsonContent(apiSuccessSchema(skillViewSchema, "SkillResponse"), "Skill draft"),
    ...errorResponses(401, 403, 404, 422),
  },
});

const putRoute = defineRoute({
  method: "put",
  path: item,
  tags: ["Skills"],
  security: [{ Bearer: [] }],
  middleware: writeMiddleware,
  request: {
    params: skillParams,
    body: jsonContent(draftBodySchema, "Skill draft"),
  },
  responses: {
    200: jsonContent(apiSuccessSchema(skillViewSchema, "SkillSavedResponse"), "Saved skill draft"),
    ...errorResponses(401, 403, 404, 422),
  },
});

const publishRoute = defineRoute({
  method: "post",
  path: `${item}/publish`,
  tags: ["Skills"],
  security: [{ Bearer: [] }],
  middleware: writeMiddleware,
  request: { params: skillParams },
  responses: {
    200: jsonContent(apiSuccessSchema(publishResultSchema, "SkillPublishedResponse"), "Published skill"),
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

skillRoutes.openapi(listRoute, async (c) => {
  const access = c.get("access");
  const workspace = workspaceId(access);
  const rows = await run(c, tenantContext(c), (tx) =>
    tx
      .select()
      .from(skills)
      .where(and(eq(skills.tenantId, access.tenantId), eq(skills.workspaceId, workspace))),
  );
  return c.json(ok(rows.map(toView)), 200);
});

skillRoutes.openapi(createRoute, async (c) => {
  const access = c.get("access");
  const workspace = workspaceId(access);
  const saved = await run(c, tenantContext(c), (tx) =>
    saveSkillDraft(tx, {
      tenantId: access.tenantId,
      workspaceId: workspace,
      draft: c.req.valid("json"),
    }),
  );
  return c.json(ok(toView(saved)), 200);
});

skillRoutes.openapi(getRoute, async (c) => {
  const { skillId } = c.req.valid("param");
  const access = c.get("access");
  const workspace = workspaceId(access);
  const [row] = await run(c, tenantContext(c), (tx) =>
    tx
      .select()
      .from(skills)
      .where(
        and(
          eq(skills.id, skillId),
          eq(skills.tenantId, access.tenantId),
          eq(skills.workspaceId, workspace),
        ),
      ),
  );
  if (!row) throw new NotFoundError("Skill not found");
  return c.json(ok(toView(row)), 200);
});

skillRoutes.openapi(putRoute, async (c) => {
  const { skillId } = c.req.valid("param");
  const access = c.get("access");
  const workspace = workspaceId(access);
  const saved = await run(c, tenantContext(c), (tx) =>
    saveSkillDraft(tx, {
      tenantId: access.tenantId,
      workspaceId: workspace,
      id: skillId,
      draft: c.req.valid("json"),
    }),
  );
  return c.json(ok(toView(saved)), 200);
});

skillRoutes.openapi(publishRoute, async (c) => {
  const { skillId } = c.req.valid("param");
  const access = c.get("access");
  const principal = c.get("principal");
  const workspace = workspaceId(access);
  const catalog = await loadToolCatalog(c.get("deps").connectors, access.tenantId, workspace);
  const published = await run(c, tenantContext(c), async (tx) => {
    const result = await publishSkill(tx, {
      tenantId: access.tenantId,
      workspaceId: workspace,
      id: skillId,
      publishedBy: principal.userId,
      catalog,
    });
    await recordAudit(tx, {
      eventType: "config.skill_published",
      tenantId: access.tenantId,
      workspaceId: workspace,
      actorId: principal.userId,
      actorRole: access.role,
      requestId: c.get("requestId"),
      resourceType: "skill",
      resourceId: result.skillId,
      payload: { version: result.version },
    });
    return result;
  });
  return c.json(ok({ id: published.skillId, version: published.version, status: "published" as const }), 200);
});
