import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { actionIntents } from "./action-intents";
import { tenants, workspaces } from "./tenancy";

/**
 * One successful external write. A failed call does not insert a row.
 * Must stay aligned with supabase/migrations/*_0036_action_outcomes.sql.
 */
export const actionOutcomes = pgTable(
  "action_outcomes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actionId: uuid("action_intent_id")
      .notNull()
      .references(() => actionIntents.id, { onDelete: "restrict" }),
    externalId: text("external_id").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("action_outcomes_action_intent_id_unique").on(table.actionId),
    check("action_outcomes_external_id_check", sql`char_length(${table.externalId}) between 1 and 200`),
  ],
);
