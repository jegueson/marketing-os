import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants, workspaces } from "./tenancy";

/**
 * Cockpit words for confidence and effort. The PRD names the fields and does
 * not give a numeric scale. These three match risk class, so the row stores
 * no float and no model prompt.
 */
export const recommendationLevels = ["low", "medium", "high"] as const;
export type RecommendationLevel = (typeof recommendationLevels)[number];

/** Mirrors the approval object in PRD section 32. Null means no approval yet. */
export const recommendationApprovalStatuses = [
  "pending",
  "approved",
  "rejected",
  "expired",
  "cancelled",
] as const;
export type RecommendationApprovalStatus = (typeof recommendationApprovalStatuses)[number];

/**
 * A recommendation is fixture text plus a proposed action. It has no prompt column.
 * Must stay aligned with supabase/migrations/*_0030_recommendations.sql.
 */
export const recommendations = pgTable(
  "recommendations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    problem: text("problem").notNull(),
    evidence: text("evidence").notNull(),
    proposedAction: text("proposed_action").notNull(),
    expectedImpact: text("expected_impact").notNull(),
    confidence: text("confidence").notNull().$type<RecommendationLevel>(),
    effort: text("effort").notNull().$type<RecommendationLevel>(),
    approvalStatus: text("approval_status").$type<RecommendationApprovalStatus>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_recommendations_tenant_workspace").on(
      table.tenantId,
      table.workspaceId,
      table.createdAt,
    ),
    check("recommendations_problem_check", sql`char_length(trim(${table.problem})) between 1 and 2000`),
    check("recommendations_evidence_check", sql`char_length(trim(${table.evidence})) between 1 and 4000`),
    check(
      "recommendations_proposed_action_check",
      sql`char_length(trim(${table.proposedAction})) between 1 and 2000`,
    ),
    check(
      "recommendations_expected_impact_check",
      sql`char_length(trim(${table.expectedImpact})) between 1 and 2000`,
    ),
    check("recommendations_confidence_check", sql`${table.confidence} in ('low', 'medium', 'high')`),
    check("recommendations_effort_check", sql`${table.effort} in ('low', 'medium', 'high')`),
    check(
      "recommendations_approval_status_check",
      sql`${table.approvalStatus} is null or ${table.approvalStatus} in ('pending', 'approved', 'rejected', 'expired', 'cancelled')`,
    ),
  ],
);
