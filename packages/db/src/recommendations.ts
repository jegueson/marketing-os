import { desc, eq } from "drizzle-orm";
import type { Database } from "./context";
import {
  recommendations,
  type RecommendationApprovalStatus,
  type RecommendationLevel,
} from "./schema/recommendations";

export type RecommendationDraft = {
  tenantId: string;
  workspaceId: string;
  problem: string;
  evidence: string;
  proposedAction: string;
  expectedImpact: string;
  confidence: RecommendationLevel;
  effort: RecommendationLevel;
};

export type StoredRecommendation = {
  id: string;
  problem: string;
  evidence: string;
  proposedAction: string;
  expectedImpact: string;
  confidence: RecommendationLevel;
  effort: RecommendationLevel;
  approvalStatus: RecommendationApprovalStatus | null;
};

const recommendationColumns = {
  id: recommendations.id,
  problem: recommendations.problem,
  evidence: recommendations.evidence,
  proposedAction: recommendations.proposedAction,
  expectedImpact: recommendations.expectedImpact,
  confidence: recommendations.confidence,
  effort: recommendations.effort,
  approvalStatus: recommendations.approvalStatus,
};

/** Insert fixture text. Approval stays unset. The draft has no prompt field. */
export async function insertRecommendation(
  tx: Database,
  draft: RecommendationDraft,
): Promise<StoredRecommendation> {
  const [row] = await tx
    .insert(recommendations)
    .values({
      tenantId: draft.tenantId,
      workspaceId: draft.workspaceId,
      problem: draft.problem,
      evidence: draft.evidence,
      proposedAction: draft.proposedAction,
      expectedImpact: draft.expectedImpact,
      confidence: draft.confidence,
      effort: draft.effort,
    })
    .returning(recommendationColumns);

  if (!row) {
    throw new Error("recommendation insert returned no row");
  }

  return row;
}

/** Workspace rows only. Tenant isolation stays on the transaction. */
export async function listRecommendations(tx: Database, workspaceId: string): Promise<StoredRecommendation[]> {
  return tx
    .select(recommendationColumns)
    .from(recommendations)
    .where(eq(recommendations.workspaceId, workspaceId))
    .orderBy(desc(recommendations.createdAt));
}
