import { z } from "@hono/zod-openapi";
import { and, desc, eq } from "drizzle-orm";
import { NotFoundError, ok } from "@marketing-os/core";
import {
  brandProfiles,
  businessProfiles,
  configVersions,
  publishProfile,
  saveProfileDraft,
  type Database,
  type ProfileKind,
} from "@marketing-os/db";
import { requirePrincipal } from "../auth/principal";
import { requireWorkspace } from "../auth/access";
import { requireConfigEnabled } from "../auth/config-flag";
import { run, tenantContext } from "../context";
import { recordAudit } from "../lib/events";
import {
  apiSuccessSchema,
  createRouter,
  defineRoute,
  errorResponses,
  jsonContent,
  jsonValueSchema,
  uuidPathParam,
} from "../lib/openapi";

export const profileRoutes = createRouter();

const kindSchema = z.enum(["business", "brand"]);

const profileParams = z.object({
  workspaceId: uuidPathParam("workspaceId"),
  kind: kindSchema,
});

const profileViewSchema = z
  .object({
    kind: kindSchema,
    status: z.enum(["draft", "published"]),
    activeVersion: z.number().int().nullable(),
    draft: jsonValueSchema.nullable(),
  })
  .openapi("ProfileView");

const publishResultSchema = z
  .object({
    kind: kindSchema,
    version: z.number().int(),
    status: z.literal("published"),
  })
  .openapi("ProfilePublishResult");

const versionSchema = z
  .object({
    version: z.number().int(),
    createdAt: z.string(),
    publishedBy: z.string().uuid().nullable(),
  })
  .openapi("ProfileVersion");

const draftBodySchema = z.record(z.string(), z.unknown()).openapi("ProfileDraftBody");

const base = "/api/v1/workspaces/{workspaceId}/profiles/{kind}";

const readMiddleware = [requirePrincipal, requireConfigEnabled, requireWorkspace("config:read")];
const writeMiddleware = [requirePrincipal, requireConfigEnabled, requireWorkspace("config:write")];

const getRoute = defineRoute({
  method: "get",
  path: base,
  tags: ["Profiles"],
  security: [{ Bearer: [] }],
  middleware: readMiddleware,
  request: { params: profileParams },
  responses: {
    200: jsonContent(apiSuccessSchema(profileViewSchema, "ProfileResponse"), "Profile draft"),
    ...errorResponses(401, 403, 404, 422),
  },
});

const putRoute = defineRoute({
  method: "put",
  path: base,
  tags: ["Profiles"],
  security: [{ Bearer: [] }],
  middleware: writeMiddleware,
  request: {
    params: profileParams,
    body: jsonContent(draftBodySchema, "Profile draft"),
  },
  responses: {
    200: jsonContent(apiSuccessSchema(profileViewSchema, "ProfileSavedResponse"), "Saved profile draft"),
    ...errorResponses(401, 403, 404, 422),
  },
});

const publishRoute = defineRoute({
  method: "post",
  path: `${base}/publish`,
  tags: ["Profiles"],
  security: [{ Bearer: [] }],
  middleware: writeMiddleware,
  request: { params: profileParams },
  responses: {
    200: jsonContent(apiSuccessSchema(publishResultSchema, "ProfilePublishedResponse"), "Published profile"),
    ...errorResponses(401, 403, 404, 422),
  },
});

const versionsRoute = defineRoute({
  method: "get",
  path: `${base}/versions`,
  tags: ["Profiles"],
  security: [{ Bearer: [] }],
  middleware: readMiddleware,
  request: { params: profileParams },
  responses: {
    200: jsonContent(apiSuccessSchema(z.array(versionSchema), "ProfileVersionListResponse"), "Published profile versions"),
    ...errorResponses(401, 403, 404, 422),
  },
});

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function workspaceId(access: { workspaceId: string | null }): string {
  if (!access.workspaceId) throw new NotFoundError("Workspace not found");
  return access.workspaceId;
}

async function loadDraft(tx: Database, kind: ProfileKind, tenantId: string, workspaceId: string) {
  if (kind === "business") {
    const [row] = await tx
      .select()
      .from(businessProfiles)
      .where(and(eq(businessProfiles.tenantId, tenantId), eq(businessProfiles.workspaceId, workspaceId)));
    return row ?? null;
  }
  const [row] = await tx
    .select()
    .from(brandProfiles)
    .where(and(eq(brandProfiles.tenantId, tenantId), eq(brandProfiles.workspaceId, workspaceId)));
  return row ?? null;
}

profileRoutes.openapi(getRoute, async (c) => {
  const { kind } = c.req.valid("param");
  const access = c.get("access");
  const workspace = workspaceId(access);
  const row = await run(c, tenantContext(c), (tx) => loadDraft(tx, kind, access.tenantId, workspace));
  return c.json(
    ok({
      kind,
      status: row?.status ?? "draft",
      activeVersion: row?.activeVersion ?? null,
      draft: row?.draft ?? null,
    }),
    200,
  );
});

profileRoutes.openapi(putRoute, async (c) => {
  const { kind } = c.req.valid("param");
  const access = c.get("access");
  const workspace = workspaceId(access);
  const saved = await run(c, tenantContext(c), (tx) =>
    saveProfileDraft(tx, {
      tenantId: access.tenantId,
      workspaceId: workspace,
      kind,
      draft: c.req.valid("json"),
    }),
  );
  return c.json(
    ok({
      kind: saved.kind,
      status: saved.status,
      activeVersion: saved.activeVersion,
      draft: saved.draft,
    }),
    200,
  );
});

profileRoutes.openapi(publishRoute, async (c) => {
  const { kind } = c.req.valid("param");
  const access = c.get("access");
  const principal = c.get("principal");
  const workspace = workspaceId(access);
  const published = await run(c, tenantContext(c), async (tx) => {
    const result = await publishProfile(tx, {
      tenantId: access.tenantId,
      workspaceId: workspace,
      kind,
      publishedBy: principal.userId,
    });
    await recordAudit(tx, {
      eventType: "config.profile_published",
      tenantId: access.tenantId,
      workspaceId: workspace,
      actorId: principal.userId,
      actorRole: access.role,
      requestId: c.get("requestId"),
      resourceType: kind === "business" ? "business_profile" : "brand_profile",
      resourceId: result.profileId,
      payload: { kind, version: result.version },
    });
    return result;
  });
  return c.json(ok({ kind, version: published.version, status: "published" as const }), 200);
});

profileRoutes.openapi(versionsRoute, async (c) => {
  const { kind } = c.req.valid("param");
  const access = c.get("access");
  const resourceType = kind === "business" ? "business_profile" : "brand_profile";
  const workspace = workspaceId(access);
  const rows = await run(c, tenantContext(c), async (tx) => {
    const profile = await loadDraft(tx, kind, access.tenantId, workspace);
    if (!profile) return [];
    return tx
      .select({
        version: configVersions.version,
        createdAt: configVersions.createdAt,
        publishedBy: configVersions.publishedBy,
      })
      .from(configVersions)
      .where(
        and(
          eq(configVersions.tenantId, access.tenantId),
          eq(configVersions.resourceType, resourceType),
          eq(configVersions.resourceId, profile.id),
        ),
      )
      .orderBy(desc(configVersions.version));
  });
  return c.json(
    ok(rows.map((row) => ({ version: row.version, createdAt: iso(row.createdAt), publishedBy: row.publishedBy }))),
    200,
  );
});
