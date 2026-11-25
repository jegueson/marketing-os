import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { profiles, tenants, workspaces } from "./tenancy";

export const approvalStatuses = ["pending", "approved", "rejected", "expired", "cancelled"] as const;
export type ApprovalStatus = (typeof approvalStatuses)[number];

export const approvalRiskLevels = ["low", "medium", "high"] as const;
export type ApprovalRiskLevel = (typeof approvalRiskLevels)[number];

/**
 * One human decision for a proposed write. A prompt is not stored.
 * Must stay aligned with supabase/migrations/*_0031_approvals.sql.
 */
export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    reviewerId: uuid("reviewer_id").references(() => profiles.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    riskLevel: text("risk_level").notNull().$type<ApprovalRiskLevel>(),
    evidence: text("evidence").notNull(),
    expectedImpact: text("expected_impact").notNull(),
    status: text("status").notNull().default("pending").$type<ApprovalStatus>(),
    comment: text("comment"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_approvals_tenant_status_expiry").on(table.tenantId, table.status, table.expiresAt),
    check("approvals_action_check", sql`char_length(trim(${table.action})) between 1 and 2000`),
    check("approvals_evidence_check", sql`char_length(trim(${table.evidence})) between 1 and 4000`),
    check(
      "approvals_expected_impact_check",
      sql`char_length(trim(${table.expectedImpact})) between 1 and 2000`,
    ),
    check("approvals_risk_level_check", sql`${table.riskLevel} in ('low', 'medium', 'high')`),
    check(
      "approvals_status_check",
      sql`${table.status} in ('pending', 'approved', 'rejected', 'expired', 'cancelled')`,
    ),
    check(
      "approvals_comment_check",
      sql`${table.comment} is null or char_length(trim(${table.comment})) between 1 and 2000`,
    ),
    check(
      "approvals_decision_shape_check",
      sql`(
        ${table.status} in ('pending', 'expired')
        and ${table.reviewerId} is null
        and ${table.comment} is null
        and ${table.decidedAt} is null
      ) or (
        ${table.status} in ('approved', 'rejected', 'cancelled')
        and ${table.reviewerId} is not null
        and ${table.comment} is not null
        and ${table.decidedAt} is not null
      )`,
    ),
  ],
);
