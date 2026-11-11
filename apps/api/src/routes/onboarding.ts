import { z } from "@hono/zod-openapi";
import { and, asc, eq } from "drizzle-orm";
import { NotFoundError, ok } from "@marketing-os/core";
import { checklistItemUpdateSchema } from "@marketing-os/schemas";
import { onboardingChecklistItems, onboardingProjects, type Database } from "@marketing-os/db";
import { requirePrincipal } from "../auth/principal";
import { requireWorkspace } from "../auth/access";
import { run, tenantContext } from "../context";
import { recordAudit } from "../lib/events";
import { parseBody, parseUuidParam } from "../lib/http";
import {
  apiSuccessSchema,
  createRouter,
  defineRoute,
  errorResponses,
  jsonBody,
  jsonContent,
  jsonValueSchema,
  uuidPathParam,
} from "../lib/openapi";

export const onboardingRoutes = createRouter();

const base = "/api/v1/workspaces/:workspaceId/onboarding";
const openApiBase = "/api/v1/workspaces/{workspaceId}/onboarding";

const getOnboardingRoute = defineRoute({
  method: "get",
  path: openApiBase,
  tags: ["Onboarding"],
  security: [{ Bearer: [] }],
  middleware: [requireWorkspace("cockpit:view")],
  request: { params: z.object({ workspaceId: uuidPathParam("workspaceId") }) },
  responses: {
    200: jsonContent(apiSuccessSchema(jsonValueSchema, "OnboardingResponse"), "Onboarding project and checklist"),
    ...errorResponses(401, 403, 404, 422),
  },
});

const updateChecklistItemRoute = defineRoute({
  method: "patch",
  path: `${openApiBase}/items/{itemId}`,
  tags: ["Onboarding"],
  security: [{ Bearer: [] }],
  middleware: [requireWorkspace("onboarding:manage")],
  request: {
    params: z.object({ workspaceId: uuidPathParam("workspaceId"), itemId: uuidPathParam("itemId") }),
    body: jsonBody(checklistItemUpdateSchema as never),
  },
  responses: {
    200: jsonContent(apiSuccessSchema(jsonValueSchema, "OnboardingItemResponse"), "Updated checklist item"),
    ...errorResponses(401, 403, 404, 422),
  },
});

onboardingRoutes.use(base, requirePrincipal);
onboardingRoutes.use(`${base}/*`, requirePrincipal);

export async function loadOnboarding(tx: Database, workspaceId: string) {
  const [project] = await tx
    .select()
    .from(onboardingProjects)
    .where(eq(onboardingProjects.workspaceId, workspaceId));
  if (!project) return null;
  const items = await tx
    .select({
      id: onboardingChecklistItems.id,
      key: onboardingChecklistItems.key,
      title: onboardingChecklistItems.title,
      description: onboardingChecklistItems.description,
      status: onboardingChecklistItems.status,
      completedAt: onboardingChecklistItems.completedAt,
    })
    .from(onboardingChecklistItems)
    .where(eq(onboardingChecklistItems.projectId, project.id))
    .orderBy(asc(onboardingChecklistItems.sortOrder));
  return { projectId: project.id, status: project.status, items };
}

/** Marks the project completed once every item is completed or skipped. */
export async function refreshProjectStatus(tx: Database, projectId: string): Promise<void> {
  const items = await tx
    .select({ status: onboardingChecklistItems.status })
    .from(onboardingChecklistItems)
    .where(eq(onboardingChecklistItems.projectId, projectId));
  const done = items.length > 0 && items.every((i) => i.status === "completed" || i.status === "skipped");
  const now = new Date();
  await tx
    .update(onboardingProjects)
    .set(done ? { status: "completed", completedAt: now, updatedAt: now } : { status: "in_progress", completedAt: null, updatedAt: now })
    .where(eq(onboardingProjects.id, projectId));
}

onboardingRoutes.openapi(getOnboardingRoute, async (c) => {
  const workspaceId = parseUuidParam(c, "workspaceId");
  const onboarding = await run(c, tenantContext(c), (tx) => loadOnboarding(tx, workspaceId));
  if (!onboarding) throw new NotFoundError("Onboarding not found");
  return c.json(ok({ workspaceId, ...onboarding }), 200);
});

onboardingRoutes.openapi(updateChecklistItemRoute, async (c) => {
  const workspaceId = parseUuidParam(c, "workspaceId");
  const itemId = parseUuidParam(c, "itemId");
  const { status } = await parseBody(c, checklistItemUpdateSchema);
  const access = c.get("access");
  const userId = c.get("principal").userId;
  const item = await run(c, tenantContext(c), async (tx) => {
    const [project] = await tx
      .select({ id: onboardingProjects.id })
      .from(onboardingProjects)
      .where(eq(onboardingProjects.workspaceId, workspaceId));
    if (!project) throw new NotFoundError("Onboarding not found");
    const completed = status === "completed";
    const [updated] = await tx
      .update(onboardingChecklistItems)
      .set({
        status,
        completedAt: completed ? new Date() : null,
        completedBy: completed ? userId : null,
        updatedAt: new Date(),
      })
      .where(and(eq(onboardingChecklistItems.id, itemId), eq(onboardingChecklistItems.projectId, project.id)))
      .returning();
    if (!updated) throw new NotFoundError("Checklist item not found");
    await refreshProjectStatus(tx, project.id);
    await recordAudit(tx, {
      eventType: "onboarding.item_updated",
      tenantId: access.tenantId,
      workspaceId,
      actorId: userId,
      actorRole: access.role,
      resourceType: "onboarding_item",
      resourceId: itemId,
      payload: { key: updated.key, status },
      requestId: c.get("requestId"),
    });
    return updated;
  });
  return c.json(ok(item), 200);
});
