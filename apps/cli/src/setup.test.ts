import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encryptSecret, importMasterKey } from "@marketing-os/core";
import { createTestDatabase, type TestDatabase } from "@marketing-os/db/testing";
import type { AuthAdmin } from "./auth-admin";
import { runModelsMigrate } from "./models-migrate";
import { runSetup, type SetupInput } from "./setup";

const DATA_KEY = Buffer.alloc(32, 7).toString("base64");

class FakeAuthAdmin implements AuthAdmin {
  readonly staffRoles = new Map<string, string>();
  constructor(private readonly testDb: TestDatabase) {}
  private readonly ids = new Map<string, string>();

  async ensureUser(email: string): Promise<{ id: string; created: boolean }> {
    const existing = this.ids.get(email);
    if (existing) return { id: existing, created: false };
    const id = crypto.randomUUID();
    await this.testDb.pg.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
    this.ids.set(email, id);
    return { id, created: true };
  }

  async setStaffRole(userId: string, role: string): Promise<void> {
    this.staffRoles.set(userId, role);
  }
}

const input: SetupInput = {
  deploymentMode: "self_hosted",
  adminEmail: "Admin@Example.com",
  adminPassword: "a-long-local-password",
  tenantName: "Local Team",
  tenantSlug: "local",
  modelProvider: "openrouter",
  modelApiKey: "sk-or-v1-testkey-123456",
  force: false,
};

describe("mos setup", () => {
  let testDb: TestDatabase;
  let auth: FakeAuthAdmin;
  let cwd: string;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    auth = new FakeAuthAdmin(testDb);
    cwd = await mkdtemp(path.join(tmpdir(), "mos-setup-"));
  });
  afterEach(() => testDb.close());

  const setup = (overrides: Partial<SetupInput> = {}) =>
    runSetup(cwd, { ...input, ...overrides }, { db: testDb.db, auth, dataKey: DATA_KEY });

  it("turns a fresh database into a single-tenant install", async () => {
    const result = await setup();
    expect(result.created).toBe(true);
    const { rows } = await testDb.pg.query<Record<string, unknown>>(
      `select t.slug, w.slug as workspace, m.role, p.email
         from tenants t
         join workspaces w on w.tenant_id = t.id
         join tenant_memberships m on m.tenant_id = t.id
         join profiles p on p.id = m.user_id`,
    );
    expect(rows).toEqual([{ slug: "local", workspace: "default", role: "customer_admin", email: "admin@example.com" }]);
    expect([...auth.staffRoles.values()]).toEqual(["platform_admin"]);
    const { rows: kpis } = await testDb.pg.query<{ key: string; target: string | null }>(
      `select key, target::text from metric_definitions
        where tenant_id is null and key in ('Spend','Sessions','KeyEvents','AdsConversions','Leads','LeadCAC','QualifiedLeadCAC','CostPerSession')
        order by key`,
    );
    expect(kpis.map((row) => row.key)).toEqual([
      "AdsConversions",
      "CostPerSession",
      "KeyEvents",
      "LeadCAC",
      "Leads",
      "QualifiedLeadCAC",
      "Sessions",
      "Spend",
    ]);
    expect(kpis.find((row) => row.key === "LeadCAC")?.target).toBe("40.000000");
    expect(kpis.find((row) => row.key === "Spend")?.target).toBeNull();
    const { rows: audit } = await testDb.pg.query("select 1 from audit_events where event_type = 'setup.completed'");
    expect(audit).toHaveLength(1);

    const { rows: skills } = await testDb.pg.query<{ name: string; status: string; active_version: number }>(
      `select draft->>'name' as name, status, active_version
         from skills
        where tenant_id = $1 and workspace_id = $2
        order by draft->>'name'`,
      [result.tenantId, result.workspaceId],
    );
    expect(skills).toEqual([
      { name: "weekly-performance-review", status: "published", active_version: 1 },
    ]);
    const onDisk = JSON.parse(await readFile(result.configPath, "utf8")) as { starterSkillsSeeded: boolean };
    expect(onDisk.starterSkillsSeeded).toBe(true);
  });

  it("is safe to run twice", async () => {
    await setup();
    const second = await setup();
    expect(second.created).toBe(false);
    const { rows } = await testDb.pg.query<{ n: number }>(
      "select (select count(*)::int from tenants) + (select count(*)::int from workspaces) + (select count(*)::int from tenant_memberships) as n",
    );
    expect(rows[0]?.n).toBe(3);
    const { rows: catalog } = await testDb.pg.query<{ n: number }>(
      "select count(*)::int as n from metric_definitions where tenant_id is null",
    );
    expect(catalog[0]?.n).toBeGreaterThanOrEqual(8);
    const { rows: creds } = await testDb.pg.query<{ n: number }>(
      "select count(*)::int as n from model_credentials",
    );
    expect(creds[0]?.n).toBe(1);

    const { rows: skillRows } = await testDb.pg.query<{ n: number }>(
      "select count(*)::int as n from skills where draft->>'name' = 'weekly-performance-review'",
    );
    expect(skillRows[0]?.n).toBe(1);
    const { rows: versions } = await testDb.pg.query<{ n: number }>(
      `select count(*)::int as n from config_versions
        where resource_type = 'skill'
          and resource_id = (
            select id from skills where draft->>'name' = 'weekly-performance-review' limit 1
          )`,
    );
    expect(versions[0]?.n).toBe(1);
    const onDisk = JSON.parse(await readFile(second.configPath, "utf8")) as { starterSkillsSeeded: boolean };
    expect(onDisk.starterSkillsSeeded).toBe(true);
  });

  it("seals the model key into the database and never writes a setup.json blob", async () => {
    const result = await setup();
    expect(JSON.stringify(result)).not.toContain("sk-or-v1-testkey");
    const onDisk = JSON.parse(await readFile(result.configPath, "utf8")) as Record<string, unknown>;
    expect(onDisk.modelApiKey).toBeUndefined();
    expect(onDisk.modelKeyFingerprint).toEqual(result.modelKeyFingerprint);
    expect(JSON.stringify(onDisk)).not.toContain("sk-or-v1-testkey");
    expect(JSON.stringify(onDisk)).not.toContain("ciphertext");

    const { rows } = await testDb.pg.query<{ fingerprint: string; ciphertext: string }>(
      "select fingerprint, ciphertext from model_credentials where tenant_id = $1",
      [result.tenantId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.fingerprint).toBe(result.modelKeyFingerprint);
    expect(rows[0]!.ciphertext).not.toContain("sk-or-v1-testkey");
  });

  it("refuses weak keys and bad input", async () => {
    await expect(setup({ modelApiKey: "passwordpassword1" })).rejects.toThrow(/weak/i);
    await expect(setup({ adminPassword: "short" })).rejects.toThrow();
    await expect(setup({ tenantSlug: "Bad Slug" })).rejects.toThrow();
    await expect(setup({ deploymentMode: "mainframe" })).rejects.toThrow(/deployment mode/i);
  });

  it("refuses a data key that is not 32 bytes", async () => {
    await expect(
      runSetup(cwd, input, { db: testDb.db, auth, dataKey: Buffer.alloc(16).toString("base64") }),
    ).rejects.toThrow(/32 bytes/);
  });
});

describe("mos models migrate", () => {
  let testDb: TestDatabase;
  let auth: FakeAuthAdmin;
  let cwd: string;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    auth = new FakeAuthAdmin(testDb);
    cwd = await mkdtemp(path.join(tmpdir(), "mos-migrate-"));
  });
  afterEach(() => testDb.close());

  it("inserts one credential row and scrubs the legacy blob", async () => {
    const provisioned = await runSetup(
      cwd,
      input,
      { db: testDb.db, auth, dataKey: DATA_KEY },
    );
    // Simulate a pre-T10 install: put the sealed blob back into setup.json and clear DB.
    const key = await importMasterKey(Buffer.from(DATA_KEY, "base64"));
    const blob = await encryptSecret("sk-or-v1-legacy-key-9999", key, 1);
    const configPath = provisioned.configPath;
    await writeFile(
      configPath,
      JSON.stringify(
        {
          deploymentMode: "self_hosted",
          tenantId: provisioned.tenantId,
          workspaceId: provisioned.workspaceId,
          modelProvider: "openrouter",
          modelKeyFingerprint: "stale",
          modelApiKey: blob,
          starterSkillsSeeded: false,
        },
        null,
        2,
      ),
    );
    await testDb.pg.query("delete from model_credentials");
    await testDb.pg.query("delete from tenant_model_config");

    const migrated = await runModelsMigrate(cwd, { db: testDb.db, dataKey: DATA_KEY });
    expect(migrated.migrated).toBe(true);
    expect(migrated.fingerprint).toHaveLength(12);

    const onDisk = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
    expect(onDisk.modelApiKey).toBeUndefined();
    expect(JSON.stringify(onDisk)).not.toContain("ciphertext");
    expect(onDisk.modelKeyFingerprint).toBe(migrated.fingerprint);

    const { rows } = await testDb.pg.query<{ n: number }>(
      "select count(*)::int as n from model_credentials where tenant_id = $1",
      [provisioned.tenantId],
    );
    expect(rows[0]?.n).toBe(1);

    const again = await runModelsMigrate(cwd, { db: testDb.db, dataKey: DATA_KEY });
    expect(again.migrated).toBe(false);
    const { rows: still } = await testDb.pg.query<{ n: number }>(
      "select count(*)::int as n from model_credentials where tenant_id = $1",
      [provisioned.tenantId],
    );
    expect(still[0]?.n).toBe(1);
  });
});
