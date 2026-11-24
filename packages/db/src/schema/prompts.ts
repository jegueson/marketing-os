import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants, workspaces } from "./tenancy";

/**
 * Published tenant prompts. Append-only. Platform prompts stay in packages/prompts.
 * `content_hash` must match the body the PromptSource loads (ADR-0025 / ADR-0026).
 */
export const tenantPrompts = pgTable(
  "tenant_prompts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    version: text("version").notNull(),
    purpose: text("purpose").notNull(),
    system: text("system").notNull(),
    contentHash: text("content_hash").notNull(),
    model: jsonb("model").notNull().$type<{
      structuredOutput: "json_schema" | "json_object" | "none";
      temperatureMax: number;
      minContextWindow: number;
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("tenant_prompts_name_version").on(
      table.tenantId,
      table.workspaceId,
      table.name,
      table.version,
    ),
    index("idx_tenant_prompts_tenant_workspace").on(table.tenantId, table.workspaceId),
    check(
      "tenant_prompts_name_check",
      sql`${table.name} ~ '^tenant/[a-z][a-z0-9]*(-[a-z0-9]+)*$'`,
    ),
    check(
      "tenant_prompts_version_check",
      sql`${table.version} ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'`,
    ),
    check(
      "tenant_prompts_purpose_check",
      sql`char_length(trim(${table.purpose})) between 1 and 80`,
    ),
    check("tenant_prompts_system_check", sql`char_length(${table.system}) between 1 and 20000`),
    check("tenant_prompts_hash_check", sql`${table.contentHash} ~ '^[a-f0-9]{64}$'`),
    check("tenant_prompts_model_object_check", sql`jsonb_typeof(${table.model}) = 'object'`),
  ],
);
