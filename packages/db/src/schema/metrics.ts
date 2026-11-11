import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { connections } from "./integrations";
import { tenants } from "./tenancy";

/** Platform rows have a null tenant_id. A tenant override uses the same key. */
export const metricDefinitions = pgTable(
  "metric_definitions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    source: text("source").notNull(),
    version: text("version").notNull(),
    label: text("label").notNull(),
    unit: text("unit"),
    formula: jsonb("formula"),
    target: numeric("target", { precision: 20, scale: 6 }),
    widgets: text("widgets").array().notNull().default(sql`'{}'`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("metric_definitions_platform_key").on(table.key).where(sql`${table.tenantId} is null`),
    uniqueIndex("metric_definitions_tenant_key").on(table.tenantId, table.key).where(sql`${table.tenantId} is not null`),
    index("idx_metric_definitions_tenant").on(table.tenantId),
    check("metric_definitions_formula_op", sql`${table.formula} is null or ${table.formula}->>'op' in ('sum', 'ratio', 'filter')`),
  ],
);

/**
 * Unique key is tenant, definition key, definition version, period, and dimension hash.
 * definition_key is included so two metrics that share a version string stay distinct.
 */
export const metricValues = pgTable(
  "metric_values",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    definitionKey: text("definition_key").notNull(),
    definitionVersion: text("definition_version").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    dimensionHash: text("dimension_hash").notNull(),
    connectionId: uuid("connection_id").references(() => connections.id, { onDelete: "set null" }),
    value: numeric("value", { precision: 20, scale: 6 }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("metric_values_lineage").on(
      table.tenantId,
      table.definitionKey,
      table.definitionVersion,
      table.periodStart,
      table.periodEnd,
      table.dimensionHash,
    ),
    index("idx_metric_values_tenant").on(table.tenantId, table.definitionKey),
    check("metric_values_version_present", sql`length(${table.definitionVersion}) > 0`),
  ],
);
