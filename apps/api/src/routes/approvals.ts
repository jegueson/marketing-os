import { z } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";
import { ConflictError, NotFoundError, fail, ok } from "@marketing-os/core";
import { approvals, decideApproval, expireApprovals } from "@marketing-os/db";
import { requireWorkspace } from "../auth/access";
import { requireManagedWork } from "../auth/managed-flag";
import { requirePrincipal } from "../auth/principal";
import { run, tenantContext } from "../context";
import { recordAudit } from "../lib/events";
import {
  apiSuccessSchema,
  createRouter,
  defineRoute,
  errorResponses,
  jsonContent,
  uuidPathParam,
} from "../lib/openapi";

export const approvalRoutes = createRouter();

const approvalStatusSchema = z.enum(["pending", "approved", "rejected", "expired", "cancelled"]);

const approvalViewSchema = z
  .object({
    id: z.string().uuid(),
    action: z.string(),
    riskLevel: z.enum(["low", "medium", "high"]),
    evidence: z.string(),
    expectedImpact: z.string(),
    status: approvalStatusSchema,
    comment: z.string().nullable(),
    requesterId: z.string().uuid(),
    reviewerId: z.string().uuid().nullable(),
    expiresAt: z.string().datetime(),
    decidedAt: z.string().datetime().nullable(),
  })
  .openapi("Approval");

const decisionBodySchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    comment: z.string().trim().min(1).max(2000),
  })
  .strict()
  .openapi("ApprovalDecision");

const listParams = z.object({ workspaceId: uuidPathParam("workspaceId") });
const itemParams = listParams.extend({ approvalId: uuidPathParam("approvalId") });

const base = "/api/v1/workspaces/{workspaceId}/approvals";
const guard = [requirePrincipal, requireManagedWork, requireWorkspace("approvals:decide", { missingAccess: "not_found" })];

const listRoute = defineRoute({
  method: "get",
  path: base,
  tags: ["Approvals"],
  security: [{ Bearer: [] }],
  middleware: guard,
  request: { params: listParams },
  responses: {
    200: jsonContent(apiSuccessSchema(z.array(approvalViewSchema), "ApprovalListResponse"), "Workspace approvals"),
    ...errorResponses(401, 403, 404),
  },
});

const getRoute = defineRoute({
  method: "get",
  path: `${base}/{approvalId}`,
  tags: ["Approvals"],
  security: [{ Bearer: [] }],
  middleware: guard,
  request: { params: itemParams },
  responses: {
    200: jsonContent(apiSuccessSchema(approvalViewSchema, "ApprovalResponse"), "One approval"),
    ...errorResponses(401, 403, 404),
  },
});

const decideRoute = defineRoute({
  method: "post",
  path: `${base}/{approvalId}/decision`,
  tags: ["Approvals"],
  security: [{ Bearer: [] }],
  middleware: guard,
  request: {
    params: itemParams,
    body: jsonContent(decisionBodySchema, "Approval decision"),
  },
  responses: {
    200: jsonContent(apiSuccessSchema(approvalViewSchema, "ApprovalDecidedResponse"), "Recorded decision"),
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

type ApprovalRow = typeof approvals.$inferSelect;

function iso(value: Date): string {
  return value.toISOString();
}

function toView(row: ApprovalRow) {
  return {
    id: row.id,
    action: row.action,
    riskLevel: row.riskLevel,
    evidence: row.evidence,
    expectedImpact: row.expectedImpact,
    status: row.status,
    comment: row.comment,
    requesterId: row.requesterId,
    reviewerId: row.reviewerId,
    expiresAt: iso(row.expiresAt),
    decidedAt: row.decidedAt ? iso(row.decidedAt) : null,
  };
}

function workspaceOf(access: { workspaceId: string | null }): string {
  if (!access.workspaceId) throw new NotFoundError();
  return access.workspaceId;
}

approvalRoutes.openapi(listRoute, async (c) => {
  const workspaceId = workspaceOf(c.get("access"));
  const rows = await run(c, tenantContext(c), (tx) =>
    tx.select().from(approvals).where(eq(approvals.workspaceId, workspaceId)),
  );
  return c.json(ok(rows.map(toView)), 200);
});

approvalRoutes.openapi(getRoute, async (c) => {
  const { approvalId } = c.req.valid("param");
  const workspaceId = workspaceOf(c.get("access"));
  const [row] = await run(c, tenantContext(c), (tx) =>
    tx
      .select()
      .from(approvals)
      .where(and(eq(approvals.id, approvalId), eq(approvals.workspaceId, workspaceId))),
  );
  if (!row) throw new NotFoundError();
  return c.json(ok(toView(row)), 200);
});

approvalRoutes.openapi(decideRoute, async (c) => {
  const { approvalId } = c.req.valid("param");
  const body = c.req.valid("json");
  const access = c.get("access");
  const workspaceId = workspaceOf(access);
  const principal = c.get("principal");
  const now = new Date();

  await run(c, tenantContext(c), (tx) => expireApprovals(tx, now));

  try {
    const view = await run(c, tenantContext(c), async (tx) => {
      const [row] = await tx
        .select()
        .from(approvals)
        .where(and(eq(approvals.id, approvalId), eq(approvals.workspaceId, workspaceId)))
        .for("update");
      if (!row) throw new NotFoundError();
      if (row.status !== "pending") throw new ConflictError("approval already decided");
      await decideApproval(tx, {
        approvalId,
        reviewerId: principal.userId,
        decision: body.decision,
        comment: body.comment,
        now,
      });
      const [updated] = await tx.select().from(approvals).where(eq(approvals.id, approvalId));
      if (!updated) throw new NotFoundError();
      await recordAudit(tx, {
        eventType: "approval.decided",
        tenantId: access.tenantId,
        workspaceId,
        actorId: principal.userId,
        actorRole: access.role,
        resourceType: "approval",
        resourceId: approvalId,
        payload: { status: updated.status },
        requestId: c.get("requestId"),
      });
      return toView(updated);
    });
    return c.json(ok(view), 200);
  } catch (error) {
    if (error instanceof ConflictError) return c.json(fail("conflict", error.message), 409);
    throw error;
  }
});
