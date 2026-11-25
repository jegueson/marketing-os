import { and, eq, lte } from "drizzle-orm";
import { ConflictError, NotFoundError, ValidationError } from "@marketing-os/core";
import type { Database } from "./context";
import {
  approvals,
  type ApprovalRiskLevel,
  type ApprovalStatus,
} from "./schema/approvals";

export type ApprovalDraft = {
  tenantId: string;
  workspaceId: string;
  requesterId: string;
  action: string;
  riskLevel: ApprovalRiskLevel;
  evidence: string;
  expectedImpact: string;
  expiresAt: Date;
};

export type ApprovalDecisionName = "approved" | "rejected";

export type DecideApprovalInput = {
  approvalId: string;
  reviewerId: string;
  decision: ApprovalDecisionName;
  comment: string;
  now: Date;
};

export type StoredApproval = {
  id: string;
  status: ApprovalStatus;
  reviewerId: string | null;
  comment: string | null;
  decidedAt: Date | null;
};

const returning = {
  id: approvals.id,
  status: approvals.status,
  reviewerId: approvals.reviewerId,
  comment: approvals.comment,
  decidedAt: approvals.decidedAt,
};

/** Open a pending approval. The row has no reviewer and no prompt. */
export async function insertApproval(tx: Database, draft: ApprovalDraft): Promise<StoredApproval> {
  const [row] = await tx
    .insert(approvals)
    .values({
      tenantId: draft.tenantId,
      workspaceId: draft.workspaceId,
      requesterId: draft.requesterId,
      action: draft.action,
      riskLevel: draft.riskLevel,
      evidence: draft.evidence,
      expectedImpact: draft.expectedImpact,
      expiresAt: draft.expiresAt,
      status: "pending",
    })
    .returning(returning);

  if (!row) {
    throw new Error("approval insert returned no row");
  }
  return row;
}

/** Move pending rows at or before `now` to expired. Returns how many changed. */
export async function expireApprovals(tx: Database, now: Date): Promise<number> {
  const rows = await tx
    .update(approvals)
    .set({ status: "expired", updatedAt: now })
    .where(and(eq(approvals.status, "pending"), lte(approvals.expiresAt, now)))
    .returning({ id: approvals.id });
  return rows.length;
}

/**
 * Record one decision. A past-due pending row is refused and left pending.
 * A row that is not pending throws, and the stored decision stays as it was.
 */
export async function decideApproval(tx: Database, input: DecideApprovalInput): Promise<StoredApproval> {
  const comment = input.comment.trim();
  if (comment.length < 1 || comment.length > 2000) {
    throw new ValidationError("Approval comment is required");
  }

  const [row] = await tx
    .select({
      status: approvals.status,
      expiresAt: approvals.expiresAt,
    })
    .from(approvals)
    .where(eq(approvals.id, input.approvalId))
    .for("update");

  if (!row) {
    throw new NotFoundError("Approval not found");
  }
  if (row.status !== "pending") {
    throw new ConflictError("approval already decided");
  }
  if (row.expiresAt.getTime() <= input.now.getTime()) {
    throw new ConflictError("approval expired");
  }

  const [updated] = await tx
    .update(approvals)
    .set({
      status: input.decision,
      reviewerId: input.reviewerId,
      comment,
      decidedAt: input.now,
      updatedAt: input.now,
    })
    .where(eq(approvals.id, input.approvalId))
    .returning(returning);

  if (!updated) {
    throw new Error("approval update returned no row");
  }
  return updated;
}
