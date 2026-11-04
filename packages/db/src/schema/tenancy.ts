import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    plan: text("plan").notNull().default("trial"),
    status: text("status").notNull().default("active"),
    settings: text("settings").notNull().default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "tenants_plan_check",
      sql`${table.plan} in ('trial','design_partner','active','churned')`,
    ),
    check(
      "tenants_status_check",
      sql`${table.status} in ('active','suspended','churned')`,
    ),
  ],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("workspaces_tenant_slug").on(table.tenantId, table.slug),
    index("idx_workspaces_tenant_id").on(table.tenantId),
    check("workspaces_status_check", sql`${table.status} in ('active','archived')`),
  ],
);

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name"),
  email: text("email").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenantMemberships = pgTable(
  "tenant_memberships",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("customer_user"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("tenant_memberships_tenant_user").on(table.tenantId, table.userId),
    index("idx_tm_tenant_id").on(table.tenantId),
    index("idx_tm_user_id").on(table.userId),
    check(
      "tenant_memberships_role_check",
      sql`${table.role} in ('platform_admin','success_manager','ai_specialist','customer_admin','customer_user')`,
    ),
    check(
      "tenant_memberships_status_check",
      sql`${table.status} in ('active','suspended','removed')`,
    ),
  ],
);

export const staffAssignments = pgTable(
  "staff_assignments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("staff_assignments_tenant_user").on(table.tenantId, table.userId),
    index("idx_staff_assignments_tenant_id").on(table.tenantId),
    check(
      "staff_assignments_role_check",
      sql`${table.role} in ('platform_admin','success_manager','ai_specialist')`,
    ),
  ],
);
