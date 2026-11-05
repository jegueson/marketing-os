import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import type { Database } from "./context";

export type DbHandle = {
  db: Database;
  close: () => Promise<void>;
};

/**
 * One client per request on Workers. Hyperdrive does the pooling, so `max` stays small
 * and the caller closes the client with `ctx.waitUntil(handle.close())`.
 */
export function createDb(connectionString: string): DbHandle {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  const client = postgres(connectionString, { prepare: false, max: 5, fetch_types: false });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end({ timeout: 5 }),
  };
}
