import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import type { WorkloadCategory } from "@marketing-os/schemas";
import { tenants, workspaces } from "./tenancy";

/**
 * Stored hours for one PRD section 22 category. There is no savings column.
 * Must stay aligned with supabase/migrations/*_0038_workload_categories.sql.
 */
export const workloadCategories = pgTable(
  "workload_categories",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    category: text("category").notNull().$type<WorkloadCategory>(),
    baselineHours: integer("baseline_hours").notNull(),
    hoursAbsorbed: integer("hours_absorbed").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("workload_categories_workspace_category").on(table.tenantId, table.workspaceId, table.category),
    check(
      "workload_categories_category_check",
      sql`${table.category} in ('reporting', 'media_optimization', 'seo', 'crm_operations', 'creative_production', 'research', 'tracking_qa', 'project_coordination')`,
    ),
    check("workload_categories_baseline_hours_check", sql`${table.baselineHours} >= 0`),
    check("workload_categories_hours_absorbed_check", sql`${table.hoursAbsorbed} >= 0`),
  ],
);
