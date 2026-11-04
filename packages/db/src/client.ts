import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  const client = postgres(connectionString, { prepare: false, max: 5 });
  return drizzle(client, { schema });
}
