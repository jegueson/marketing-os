import { sql, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

export type Schema = typeof schema;

/** Any Drizzle Postgres database or transaction bound to the Marketing OS schema. */
export type Database = PgDatabase<PgQueryResultHKT, Schema>;

export type DbContext = {
  userId: string | null;
  tenantId: string | null;
  /** Set only after the API has checked a staff permission. Opens platform tables (leads). */
  staff: boolean;
};

/**
 * Runs `fn` in one transaction as role `app_api` with transaction-local settings.
 * Hyperdrive pools connections, so session-level settings are forbidden (ADR-0005).
 * `SET LOCAL ROLE` makes RLS apply even when the connection user owns the tables.
 */
export async function withContext<T>(
  db: Database,
  ctx: DbContext,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role app_api`);
    await applySettings(tx, ctx);
    return fn(tx);
  });
}

/**
 * Raw query that returns rows on both drivers: postgres-js resolves to an array,
 * PGlite resolves to `{ rows }`.
 */
export async function selectRows<T extends Record<string, unknown>>(
  tx: Database,
  query: SQL,
): Promise<T[]> {
  const result = (await tx.execute(query)) as unknown;
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

/** Switches the tenant inside an open context transaction (used by provisioning). */
export async function setTenant(tx: Database, tenantId: string | null): Promise<void> {
  await tx.execute(sql`select set_config('app.tenant_id', ${tenantId ?? ""}, true)`);
}

async function applySettings(tx: Database, ctx: DbContext): Promise<void> {
  await tx.execute(sql`
    select
      set_config('app.tenant_id', ${ctx.tenantId ?? ""}, true),
      set_config('app.user_id', ${ctx.userId ?? ""}, true),
      set_config('app.staff', ${ctx.staff ? "on" : "off"}, true)
  `);
}
