import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { approvals } from "./approvals";
import { tenants, workspaces } from "./tenancy";

export type ActionIntentStatus = "awaiting_approval" | "executed" | "failed";

/**
 * One reserved write. The params body is not stored, only its hash.
 * Must stay aligned with supabase/migrations/*_0032_action_intents.sql
 * and *_0033_action_intent_approval.sql and *_0035_action_intent_execution.sql.
 */
export const actionIntents = pgTable(
  "action_intents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connector: text("connector").notNull(),
    tool: text("tool").notNull(),
    paramsHash: text("params_hash").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull().default("awaiting_approval").$type<ActionIntentStatus>(),
    approvalId: uuid("approval_id")
      .notNull()
      .references(() => approvals.id, { onDelete: "restrict" }),
    externalId: text("external_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("action_intents_tenant_key").on(table.tenantId, table.idempotencyKey),
    index("idx_action_intents_approval").on(table.approvalId),
    check(
      "action_intents_status_check",
      sql`${table.status} in ('awaiting_approval', 'executed', 'failed')`,
    ),
    check(
      "action_intents_external_id_check",
      sql`(
        (${table.status} = 'executed' and ${table.externalId} is not null and char_length(${table.externalId}) between 1 and 200)
        or (${table.status} <> 'executed' and ${table.externalId} is null)
      )`,
    ),
    check(
      "action_intents_connector_check",
      sql`char_length(${table.connector}) between 1 and 80 and ${table.connector} ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'`,
    ),
    check(
      "action_intents_tool_check",
      sql`char_length(${table.tool}) between 1 and 80 and ${table.tool} ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'`,
    ),
    check("action_intents_params_hash_check", sql`${table.paramsHash} ~ '^[a-f0-9]{64}$'`),
    check(
      "action_intents_key_check",
      sql`char_length(${table.idempotencyKey}) between 1 and 200 and ${table.idempotencyKey} = trim(${table.idempotencyKey})`,
    ),
  ],
);
