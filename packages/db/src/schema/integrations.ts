import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { profiles, tenants, workspaces } from "./tenancy";

export const connectors = pgTable("connectors", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  authType: text("auth_type").notNull(),
  status: text("status").notNull().default("active"),
  supportedScopes: jsonb("supported_scopes").notNull().default([]),
  connectorConfig: jsonb("connector_config").notNull().default({}),
  version: text("version").notNull().default("1.0.0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectorId: uuid("connector_id")
      .notNull()
      .references(() => connectors.id),
    displayName: text("display_name").notNull(),
    status: text("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    lastHealthyAt: timestamp("last_healthy_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_connections_tenant_id").on(table.tenantId),
    check(
      "connections_status_check",
      sql`${table.status} in ('pending','active','error','disconnected','expired')`,
    ),
  ],
);

export const credentialReferences = pgTable(
  "credential_references",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    ciphertext: text("ciphertext").notNull(),
    nonce: text("nonce").notNull(),
    keyVersion: text("key_version").notNull(),
    credentialType: text("credential_type").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scopes: text("scopes").array().notNull().default(sql`'{}'`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_cred_refs_connection_id").on(table.connectionId),
    index("idx_cred_refs_tenant_id").on(table.tenantId),
  ],
);

export const dataScopes = pgTable(
  "data_scopes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    resourceName: text("resource_name"),
    isActive: boolean("is_active").notNull().default(true),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
    approvedBy: uuid("approved_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("data_scopes_connection_resource").on(
      table.connectionId,
      table.resourceType,
      table.resourceId,
    ),
    index("idx_data_scopes_tenant_id").on(table.tenantId),
  ],
);

export const dataHealth = pgTable(
  "data_health",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    dataScopeId: uuid("data_scope_id").references(() => dataScopes.id),
    status: text("status").notNull().default("never_synced"),
    freshnessAt: timestamp("freshness_at", { withTimezone: true }),
    schemaState: text("schema_state"),
    recordCount: text("record_count"),
    issues: jsonb("issues").notNull().default([]),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_data_health_tenant_id").on(table.tenantId),
    check(
      "data_health_status_check",
      sql`${table.status} in ('healthy','stale','error','never_synced')`,
    ),
  ],
);
