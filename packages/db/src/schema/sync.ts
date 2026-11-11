import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { connections } from "./integrations";
import { tenants, workspaces } from "./tenancy";

/** One queue attempt window. High-volume, so the id is a bigint identity. */
export const syncRuns = pgTable(
  "sync_runs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    mode: text("mode").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    attempt: integer("attempt").notNull().default(0),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_sync_runs_connection").on(table.connectionId, table.createdAt),
    check("sync_runs_status_check", sql`${table.status} in ('queued','running','succeeded','failed')`),
    check("sync_runs_mode_check", sql`${table.mode} in ('backfill','incremental')`),
  ],
);

/** Last successful window end for a connection. The next incremental sync starts here. */
export const syncCursors = pgTable("sync_cursors", {
  connectionId: uuid("connection_id")
    .primaryKey()
    .references(() => connections.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  cursor: text("cursor").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
