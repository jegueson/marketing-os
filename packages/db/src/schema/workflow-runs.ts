import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { profiles, tenants, workspaces } from "./tenancy";
import { workflows } from "./config";

export type WorkflowRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "awaiting_approval";
export type WorkflowRunTrigger = "manual" | "schedule";

export type WorkflowRunStepRow = {
  stepId: string;
  kind: string;
  status: "ok" | "error" | "skipped";
  output: unknown;
  errorCode: string | null;
};

export type WorkflowRunReportRow = {
  title: string;
  body: string;
};

/**
 * Durable test-run / workflow execution row.
 * Steps and report hold interpreter output only — never prompt bodies.
 */
export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    workflowVersion: integer("workflow_version").notNull(),
    trigger: text("trigger").notNull().$type<WorkflowRunTrigger>(),
    status: text("status").notNull().$type<WorkflowRunStatus>(),
    errorCode: text("error_code"),
    steps: jsonb("steps").notNull().$type<WorkflowRunStepRow[]>().default([]),
    report: jsonb("report").$type<WorkflowRunReportRow | null>(),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_workflow_runs_tenant_workspace").on(table.tenantId, table.workspaceId, table.createdAt),
    index("idx_workflow_runs_workflow").on(table.tenantId, table.workflowId, table.createdAt),
    check("workflow_runs_trigger_check", sql`${table.trigger} in ('manual', 'schedule')`),
    check(
      "workflow_runs_status_check",
      sql`${table.status} in ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'awaiting_approval')`,
    ),
    check("workflow_runs_version_positive_check", sql`${table.workflowVersion} > 0`),
    check("workflow_runs_steps_array_check", sql`jsonb_typeof(${table.steps}) = 'array'`),
    check(
      "workflow_runs_report_object_check",
      sql`${table.report} is null or jsonb_typeof(${table.report}) = 'object'`,
    ),
  ],
);
