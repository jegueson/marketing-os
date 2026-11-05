import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  inet,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { profiles, tenants, workspaces } from "./tenancy";

export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    actorId: uuid("actor_id").references(() => profiles.id),
    actorRole: text("actor_role"),
    eventType: text("event_type").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    payload: jsonb("payload").notNull().default({}),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_audit_tenant_created").on(table.tenantId, table.createdAt),
    index("idx_audit_event_type").on(table.eventType),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: bigint("attempts", { mode: "number" }).notNull().default(0),
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_outbox_tenant_id").on(table.tenantId),
    check(
      "outbox_events_status_check",
      sql`${table.status} in ('pending','processing','delivered','failed')`,
    ),
  ],
);

export const eventReceipts = pgTable(
  "event_receipts",
  {
    eventId: bigint("event_id", { mode: "number" })
      .notNull()
      .references(() => outboxEvents.id),
    handler: text("handler").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.handler] })],
);

export const featureFlags = pgTable("feature_flags", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  description: text("description"),
  isEnabled: boolean("is_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const featureFlagOverrides = pgTable(
  "feature_flag_overrides",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    featureFlagId: uuid("feature_flag_id")
      .notNull()
      .references(() => featureFlags.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    isEnabled: boolean("is_enabled").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("ff_overrides_flag_tenant").on(table.featureFlagId, table.tenantId),
    index("idx_ff_overrides_tenant_id").on(table.tenantId),
  ],
);
