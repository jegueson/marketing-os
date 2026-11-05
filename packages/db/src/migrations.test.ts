import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { isTable } from "drizzle-orm";
import { permissions as codePermissions, permissionsForRole, roles } from "@marketing-os/core";
import * as schema from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
}, 60_000);

afterAll(async () => {
  await t.close();
});

type Row = Record<string, unknown>;

async function rows<T extends Row>(query: string, params: unknown[] = []): Promise<T[]> {
  return (await t.pg.query<T>(query, params)).rows;
}

describe("migrations", () => {
  it("enables vector and pgcrypto", async () => {
    const ext = await rows<{ extname: string }>("select extname from pg_extension");
    const names = ext.map((e) => e.extname);
    expect(names).toContain("vector");
    expect(names).toContain("pgcrypto");
  });

  it("enables and forces RLS on every public table", async () => {
    const tables = await rows<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    );
    expect(tables.length).toBeGreaterThan(20);
    const missing = tables.filter((r) => !r.relrowsecurity || !r.relforcerowsecurity).map((r) => r.relname);
    expect(missing).toEqual([]);
  });

  it("gives anon and authenticated no table privileges", async () => {
    const grants = await rows<{ table_name: string; grantee: string }>(
      `select table_name, grantee from information_schema.role_table_grants
       where table_schema = 'public' and grantee in ('anon', 'authenticated')`,
    );
    expect(grants).toEqual([]);
  });

  it("app_api cannot bypass RLS", async () => {
    const [role] = await rows<{ rolbypassrls: boolean; rolsuper: boolean }>(
      "select rolbypassrls, rolsuper from pg_roles where rolname = 'app_api'",
    );
    expect(role).toEqual({ rolbypassrls: false, rolsuper: false });
  });

  // Supabase's `postgres` is not a superuser, so SET ROLE app_api needs explicit membership.
  it("lets the API login role switch to app_api", async () => {
    const members = await rows<{ member: string }>(
      `select m.rolname as member from pg_auth_members a
         join pg_roles r on r.oid = a.roleid
         join pg_roles m on m.oid = a.member
        where r.rolname = 'app_api'`,
    );
    expect(members.map((m) => m.member)).toContain("postgres");
  });

  it("matches the Drizzle schema (drift check)", async () => {
    const tables = (Object.values(schema) as unknown[]).filter((value): value is PgTable =>
      isTable(value),
    );
    const problems: string[] = [];
    for (const table of tables) {
      const config = getTableConfig(table);
      const dbColumns = await rows<{ column_name: string; is_nullable: string }>(
        `select column_name, is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = $1`,
        [config.name],
      );
      if (dbColumns.length === 0) {
        problems.push(`missing table ${config.name}`);
        continue;
      }
      const byName = new Map(dbColumns.map((c) => [c.column_name, c]));
      for (const column of config.columns) {
        const db = byName.get(column.name);
        if (!db) {
          problems.push(`missing column ${config.name}.${column.name}`);
        } else if ((db.is_nullable === "NO") !== column.notNull) {
          problems.push(`nullability differs on ${config.name}.${column.name}`);
        }
        byName.delete(column.name);
      }
      for (const extra of byName.keys()) {
        problems.push(`column ${config.name}.${extra} is not in Drizzle`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("seeds the RBAC matrix from packages/core", async () => {
    const seeded = await rows<{ name: string }>("select name from permissions order by name");
    expect(seeded.map((p) => p.name)).toEqual([...codePermissions].sort());
    for (const role of roles) {
      const granted = await rows<{ name: string }>(
        `select p.name from role_permissions rp join permissions p on p.id = rp.permission_id
         where rp.role = $1 order by p.name`,
        [role],
      );
      expect(granted.map((p) => p.name), role).toEqual([...permissionsForRole(role)].sort());
    }
  });

  it("seeds the mock connector and platform flags", async () => {
    const [mock] = await rows<{ slug: string }>("select slug from connectors where slug = 'mock'");
    expect(mock?.slug).toBe("mock");
    const flags = await rows<{ key: string }>("select key from feature_flags");
    expect(flags.length).toBeGreaterThan(0);
  });
});
