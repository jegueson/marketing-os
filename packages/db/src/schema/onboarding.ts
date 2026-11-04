import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { profiles, tenants, workspaces } from "./tenancy";

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("customer_admin"),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => profiles.id),
    tokenHash: text("token_hash").notNull().unique(),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_invitations_tenant_id").on(table.tenantId),
    check(
      "invitations_status_check",
      sql`${table.status} in ('pending','accepted','expired','cancelled')`,
    ),
  ],
);

export const onboardingProjects = pgTable(
  "onboarding_projects",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Onboarding"),
    status: text("status").notNull().default("in_progress"),
    assignedTo: uuid("assigned_to").references(() => profiles.id),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_onboarding_projects_tenant_id").on(table.tenantId),
    check(
      "onboarding_projects_status_check",
      sql`${table.status} in ('in_progress','completed','blocked')`,
    ),
  ],
);

export const onboardingChecklistItems = pgTable(
  "onboarding_checklist_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    projectId: uuid("project_id")
      .notNull()
      .references(() => onboardingProjects.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    key: text("key").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("pending"),
    sortOrder: integer("sort_order").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_checklist_items_project_id").on(table.projectId),
    index("idx_checklist_items_tenant_id").on(table.tenantId),
    unique("checklist_items_project_key").on(table.projectId, table.key),
    check(
      "checklist_items_status_check",
      sql`${table.status} in ('pending','in_progress','completed','skipped')`,
    ),
  ],
);
