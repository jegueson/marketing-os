import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";
import type { Database } from "./context";

export const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../supabase/migrations",
);

/** Objects Supabase provides before our migrations run. PGlite has none of them. */
const SUPABASE_BOOTSTRAP = `
  CREATE SCHEMA IF NOT EXISTS extensions;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  END $$;
`;

export function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

export type TestDatabase = {
  pg: PGlite;
  db: Database;
  /** Creates an auth user plus profile, as Supabase Auth and the API would. */
  createUser: (email: string, id?: string) => Promise<string>;
  close: () => Promise<void>;
};

/** Fresh in-memory Postgres with every migration in `supabase/migrations` applied. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const pg = await PGlite.create({ extensions: { pgcrypto, vector } });
  await pg.exec(SUPABASE_BOOTSTRAP);
  for (const file of migrationFiles()) {
    const body = readFileSync(path.join(migrationsDir, file), "utf8");
    try {
      await pg.exec(body);
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
  }
  const db = drizzle(pg, { schema }) as unknown as Database;
  return {
    pg,
    db,
    async createUser(email, id = crypto.randomUUID()) {
      await pg.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [id, email]);
      await pg.query("INSERT INTO public.profiles (id, email) VALUES ($1, $2)", [id, email]);
      return id;
    },
    close: () => pg.close(),
  };
}
