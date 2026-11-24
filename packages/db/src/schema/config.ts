import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { profiles, tenants, workspaces } from "./tenancy";

type ConfigDocumentTable = "business_profiles" | "brand_profiles" | "skills" | "agents" | "workflows";

export type ConfigResourceType = "business_profile" | "brand_profile" | "skill" | "agent" | "workflow";

/**
 * Draft plus an active version pointer. Profiles are one row per workspace.
 * Skills and agents are many rows per workspace; the name stays inside the draft.
 * Status stays a column so the JSON document cannot disagree with it (ADR-0026).
 */
function configDocumentTable(name: ConfigDocumentTable, onePerWorkspace: boolean) {
  return pgTable(
    name,
    {
      id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
      tenantId: uuid("tenant_id")
        .notNull()
        .references(() => tenants.id, { onDelete: "cascade" }),
      workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
      status: text("status").notNull().default("draft").$type<"draft" | "published">(),
      draft: jsonb("draft").notNull().default({}),
      activeVersion: integer("active_version"),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      onePerWorkspace
        ? unique(`${name}_tenant_workspace`).on(table.tenantId, table.workspaceId)
        : index(`idx_${name}_tenant_workspace`).on(table.tenantId, table.workspaceId),
      check(`${name}_status_check`, sql`${table.status} in ('draft', 'published')`),
      check(
        `${name}_published_version_check`,
        sql`${table.status} <> 'published' or ${table.activeVersion} is not null`,
      ),
      check(
        `${name}_version_positive_check`,
        sql`${table.activeVersion} is null or ${table.activeVersion} > 0`,
      ),
      check(`${name}_draft_object_check`, sql`jsonb_typeof(${table.draft}) = 'object'`),
    ],
  );
}

export const businessProfiles = configDocumentTable("business_profiles", true);
export const brandProfiles = configDocumentTable("brand_profiles", true);
export const skills = configDocumentTable("skills", false);
export const agents = configDocumentTable("agents", false);
export const workflows = configDocumentTable("workflows", false);

/**
 * Append-only published documents. `resource_type` names the row that owns the
 * snapshot. Rows are never updated.
 */
export const configVersions = pgTable(
  "config_versions",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    resourceType: text("resource_type").notNull().$type<ConfigResourceType>(),
    resourceId: uuid("resource_id").notNull(),
    version: integer("version").notNull(),
    document: jsonb("document").notNull(),
    publishedBy: uuid("published_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("config_versions_resource_version").on(
      table.tenantId,
      table.resourceType,
      table.resourceId,
      table.version,
    ),
    index("idx_config_versions_tenant_created").on(table.tenantId, table.createdAt),
    check(
      "config_versions_resource_type_check",
      sql`${table.resourceType} in ('business_profile', 'brand_profile', 'skill', 'agent', 'workflow')`,
    ),
    check("config_versions_version_positive_check", sql`${table.version} > 0`),
    check("config_versions_document_object_check", sql`jsonb_typeof(${table.document}) = 'object'`),
  ],
);
