import { z } from "@hono/zod-openapi";
import { NotFoundError, ok } from "@marketing-os/core";
import { listRecommendations } from "@marketing-os/db";
import { requireWorkspace } from "../auth/access";
import { requireManagedWork } from "../auth/managed-flag";
import { requirePrincipal } from "../auth/principal";
import { run, tenantContext } from "../context";
import { apiSuccessSchema, createRouter, defineRoute, errorResponses, jsonContent, uuidPathParam } from "../lib/openapi";

export const recommendationRoutes = createRouter();

const recommendationViewSchema = z
  .object({
    id: z.string().uuid(),
    problem: z.string(),
    evidence: z.string(),
    proposedAction: z.string(),
    expectedImpact: z.string(),
    confidence: z.enum(["low", "medium", "high"]),
    effort: z.enum(["low", "medium", "high"]),
    approvalStatus: z.enum(["pending", "approved", "rejected", "expired", "cancelled"]).nullable(),
  })
  .openapi("Recommendation");

const listRoute = defineRoute({
  method: "get",
  path: "/api/v1/workspaces/{workspaceId}/recommendations",
  tags: ["Recommendations"],
  security: [{ Bearer: [] }],
  middleware: [requirePrincipal, requireManagedWork, requireWorkspace("cockpit:view", { missingAccess: "not_found" })],
  request: { params: z.object({ workspaceId: uuidPathParam("workspaceId") }) },
  responses: {
    200: jsonContent(apiSuccessSchema(z.array(recommendationViewSchema), "RecommendationListResponse"), "Workspace recommendations"),
    ...errorResponses(401, 403, 404),
  },
});

recommendationRoutes.openapi(listRoute, async (c) => {
  const workspaceId = c.get("access").workspaceId;
  if (!workspaceId) throw new NotFoundError();
  const rows = await run(c, tenantContext(c), (tx) => listRecommendations(tx, workspaceId));
  return c.json(ok(rows), 200);
});
