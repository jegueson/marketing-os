import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { AppError, openKeyRing } from "@marketing-os/core";
import { withContext, type DbContext } from "./context";
import {
  resolveModelCredential,
  saveTenantModelCredential,
} from "./model-credentials";
import { modelCredentials, tenantModelConfig, tenants, workspaces, tenantMemberships } from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
const ids = {
  tenantA: crypto.randomUUID(),
  tenantB: crypto.randomUUID(),
  workspaceA: crypto.randomUUID(),
  userA: "",
  userB: "",
};

const ctxA = (): DbContext => ({ tenantId: ids.tenantA, userId: ids.userA, staff: false });
const ctxB = (): DbContext => ({ tenantId: ids.tenantB, userId: ids.userB, staff: false });

function encodedKey(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of raw) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function isRlsDenial(err: unknown): boolean {
  const cause = (err as { cause?: { message?: string } }).cause;
  return /row-level security/.test(cause?.message ?? "");
}

beforeAll(async () => {
  t = await createTestDatabase();
  ids.userA = await t.createUser("model-a@example.com");
  ids.userB = await t.createUser("model-b@example.com");
  await withContext(t.db, { tenantId: ids.tenantA, userId: ids.userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: ids.tenantA, slug: "model-a", name: "Model A" });
    await tx.insert(workspaces).values({
      id: ids.workspaceA,
      tenantId: ids.tenantA,
      slug: "default",
      name: "Default",
    });
    await tx.insert(tenantMemberships).values({
      tenantId: ids.tenantA,
      userId: ids.userA,
      role: "customer_admin",
    });
  });
  await withContext(t.db, { tenantId: ids.tenantB, userId: ids.userB, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: ids.tenantB, slug: "model-b", name: "Model B" });
    await tx.insert(tenantMemberships).values({
      tenantId: ids.tenantB,
      userId: ids.userB,
      role: "customer_admin",
    });
  });
}, 60_000);

afterAll(async () => {
  await t.close();
});

describe("tenant model credentials", () => {
  it("round-trips a sealed tenant key", async () => {
    const ring = await openKeyRing(1, [{ version: 1, base64: encodedKey() }]);
    await withContext(t.db, ctxA(), async (tx) => {
      const { fingerprint } = await saveTenantModelCredential(tx, {
        tenantId: ids.tenantA,
        provider: "openrouter",
        apiKey: "sk-or-v1-fixture-key-aaaa",
        defaultModel: "openai/gpt-4o-mini",
        ring,
      });
      const resolved = await resolveModelCredential(tx, { tenantId: ids.tenantA, ring });
      expect(resolved).toMatchObject({
        provider: "openrouter",
        apiKey: "sk-or-v1-fixture-key-aaaa",
        defaultModel: "openai/gpt-4o-mini",
        fingerprint,
        source: "tenant",
      });
      const configs = await tx.select().from(tenantModelConfig);
      expect(configs).toHaveLength(1);
      expect(configs[0]).not.toHaveProperty("ciphertext");
      expect("ciphertext" in configs[0]!).toBe(false);
    });
  });

  it("keeps ciphertext out of tenant_model_config columns", async () => {
    const cols = await t.pg.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'tenant_model_config'`,
    );
    const names = cols.rows.map((r) => r.column_name);
    expect(names).not.toContain("ciphertext");
    expect(names).not.toContain("nonce");
    expect(names).toContain("provider");
  });

  it("re-seals a previous key version on resolve", async () => {
    const previous = encodedKey();
    const current = encodedKey();
    const oldRing = await openKeyRing(1, [{ version: 1, base64: previous }]);
    await withContext(t.db, ctxA(), async (tx) => {
      await saveTenantModelCredential(tx, {
        tenantId: ids.tenantA,
        provider: "openai",
        apiKey: "sk-openai-fixture-rotate",
        ring: oldRing,
      });
    });
    const ring = await openKeyRing(2, [
      { version: 1, base64: previous },
      { version: 2, base64: current },
    ]);
    await withContext(t.db, ctxA(), async (tx) => {
      const resolved = await resolveModelCredential(tx, { tenantId: ids.tenantA, ring });
      expect(resolved.apiKey).toBe("sk-openai-fixture-rotate");
      const [cred] = await tx.select().from(modelCredentials);
      expect(cred?.keyVersion).toBe("2");
    });
  });

  it("rejects tampered ciphertext", async () => {
    const ring = await openKeyRing(1, [{ version: 1, base64: encodedKey() }]);
    await withContext(t.db, ctxA(), async (tx) => {
      await saveTenantModelCredential(tx, {
        tenantId: ids.tenantA,
        provider: "anthropic",
        apiKey: "sk-ant-api03-fixture-bbbb",
        ring,
      });
      const [cred] = await tx.select().from(modelCredentials);
      const flipped = Buffer.from(cred!.ciphertext, "base64");
      flipped[0] = (flipped[0]! ^ 0xff) & 0xff;
      await tx
        .update(modelCredentials)
        .set({ ciphertext: flipped.toString("base64") })
        .where(eq(modelCredentials.id, cred!.id));
      await expect(resolveModelCredential(tx, { tenantId: ids.tenantA, ring })).rejects.toMatchObject({
        code: "credentials_unreadable",
      });
    });
  });

  it("rejects an empty API key", async () => {
    const ring = await openKeyRing(1, [{ version: 1, base64: encodedKey() }]);
    await expect(
      withContext(t.db, ctxA(), (tx) =>
        saveTenantModelCredential(tx, {
          tenantId: ids.tenantA,
          provider: "openrouter",
          apiKey: "   ",
          ring,
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("falls back to the platform key when the tenant has none", async () => {
    await withContext(t.db, ctxB(), async (tx) => {
      await tx.delete(modelCredentials);
      await tx.delete(tenantModelConfig);
      const resolved = await resolveModelCredential(tx, {
        tenantId: ids.tenantB,
        ring: null,
        platform: { provider: "openrouter", apiKey: "sk-or-v1-platform-cloud-key" },
      });
      expect(resolved.source).toBe("platform");
      expect(resolved.apiKey).toBe("sk-or-v1-platform-cloud-key");
    });
  });

  it("throws model_not_configured when no tenant or platform key exists", async () => {
    await withContext(t.db, ctxB(), async (tx) => {
      await tx.delete(modelCredentials);
      await tx.delete(tenantModelConfig);
      await expect(resolveModelCredential(tx, { tenantId: ids.tenantB, ring: null })).rejects.toSatisfy(
        (err: unknown) => err instanceof AppError && err.code === "model_not_configured",
      );
    });
  });

  it("hides tenant B credentials from tenant A", async () => {
    const ring = await openKeyRing(1, [{ version: 1, base64: encodedKey() }]);
    await withContext(t.db, ctxB(), async (tx) => {
      await saveTenantModelCredential(tx, {
        tenantId: ids.tenantB,
        provider: "openrouter",
        apiKey: "sk-or-v1-tenant-b-secret",
        ring,
      });
    });
    const visible = await withContext(t.db, ctxA(), (tx) =>
      tx.select({ tenantId: modelCredentials.tenantId }).from(modelCredentials),
    );
    expect(visible.every((row) => row.tenantId === ids.tenantA)).toBe(true);
    expect(visible.some((row) => row.tenantId === ids.tenantB)).toBe(false);
  });

  it("refuses to insert model config for another tenant", async () => {
    await expect(
      withContext(t.db, ctxA(), (tx) =>
        tx.insert(tenantModelConfig).values({
          tenantId: ids.tenantB,
          provider: "openrouter",
        }),
      ),
    ).rejects.toSatisfy(isRlsDenial);
  });

  it("forces RLS on both model tables", async () => {
    const tables = await t.pg.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname in ('tenant_model_config','model_credentials')`,
    );
    expect(tables.rows).toHaveLength(2);
    for (const row of tables.rows) {
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);
    }
  });

  it("select * on config never returns ciphertext columns", async () => {
    const rows = await withContext(t.db, ctxA(), (tx) => tx.select().from(tenantModelConfig));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row)).not.toContain("ciphertext");
      expect(Object.keys(row)).not.toContain("nonce");
      expect(row.provider).toBeTruthy();
    }
  });
});
