import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { withContext, type DbContext } from "./context";
import { insertUsageLedger, recordUsage } from "./usage-ledger";
import {
  tenantMemberships,
  tenants,
  usageLedger,
  workspaces,
} from "./schema";
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

function isMutationBlocked(err: unknown): boolean {
  const message =
    (err as { cause?: { message?: string }; message?: string }).cause?.message ??
    (err as { message?: string }).message ??
    "";
  return /usage_ledger is immutable|permission denied/i.test(message);
}

beforeAll(async () => {
  t = await createTestDatabase();
  ids.userA = await t.createUser("usage-a@example.com");
  ids.userB = await t.createUser("usage-b@example.com");
  await withContext(t.db, { tenantId: ids.tenantA, userId: ids.userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: ids.tenantA, slug: "usage-a", name: "Usage A" });
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
    await tx.insert(tenants).values({ id: ids.tenantB, slug: "usage-b", name: "Usage B" });
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

describe("usage_ledger", () => {
  it("inserts rows and has no prompt/response columns", async () => {
    await withContext(t.db, ctxA(), async (tx) => {
      await insertUsageLedger(tx, {
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        userId: ids.userA,
        purpose: "ask",
        provider: "openrouter",
        model: "openai/gpt-4o-mini",
        promptName: "ask.plan",
        promptVersion: "1",
        inputTokens: 12,
        outputTokens: 34,
        estimatedCostMicroUsd: 100,
        costBasis: "provider_list",
        latencyMs: 50,
        status: "ok",
      });
    });

    const cols = await t.pg.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'usage_ledger'`,
    );
    const names = cols.rows.map((r) => r.column_name);
    expect(names).not.toContain("prompt");
    expect(names).not.toContain("response");
    expect(names).not.toContain("prompt_body");
    expect(names).not.toContain("messages");
    expect(names).toContain("prompt_name");
    expect(names).toContain("estimated_cost_micro_usd");

    const rows = await withContext(t.db, ctxA(), (tx) => tx.select().from(usageLedger));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(rows)).not.toContain("You are a helpful");
  });

  it("rejects updates and deletes", async () => {
    const [row] = await withContext(t.db, ctxA(), async (tx) => {
      await insertUsageLedger(tx, {
        tenantId: ids.tenantA,
        purpose: "ask",
        provider: "openai",
        model: "gpt-4o-mini",
        inputTokens: 1,
        outputTokens: 1,
        costBasis: "unknown",
        latencyMs: 1,
        status: "ok",
      });
      return tx.select({ id: usageLedger.id }).from(usageLedger).limit(1);
    });

    await expect(
      withContext(t.db, ctxA(), (tx) =>
        tx.update(usageLedger).set({ status: "error" }).where(eq(usageLedger.id, row!.id)),
      ),
    ).rejects.toSatisfy(isMutationBlocked);

    await expect(
      withContext(t.db, ctxA(), (tx) => tx.delete(usageLedger).where(eq(usageLedger.id, row!.id))),
    ).rejects.toSatisfy(isMutationBlocked);
  });

  it("hides tenant B rows from tenant A", async () => {
    await withContext(t.db, ctxB(), (tx) =>
      insertUsageLedger(tx, {
        tenantId: ids.tenantB,
        purpose: "ask",
        provider: "anthropic",
        model: "claude-3-5-haiku-20241022",
        inputTokens: 5,
        outputTokens: 5,
        costBasis: "provider_list",
        latencyMs: 10,
        status: "ok",
      }),
    );

    const visible = await withContext(t.db, ctxA(), (tx) =>
      tx.select({ tenantId: usageLedger.tenantId }).from(usageLedger),
    );
    expect(visible.every((r) => r.tenantId === ids.tenantA)).toBe(true);
    expect(visible.some((r) => r.tenantId === ids.tenantB)).toBe(false);
  });

  it("recordUsage commits even when a later business txn rolls back", async () => {
    const before = await withContext(t.db, ctxA(), (tx) =>
      tx.select({ id: usageLedger.id }).from(usageLedger),
    );

    // Meter first on its own connection (ADR-0025: outside caller txn).
    await recordUsage(t.db, ctxA(), {
      tenantId: ids.tenantA,
      purpose: "ask",
      provider: "openrouter",
      model: "openai/gpt-4o-mini",
      inputTokens: 9,
      outputTokens: 9,
      costBasis: "unknown",
      latencyMs: 9,
      status: "error",
      errorCode: "auth_failed",
    });

    await expect(
      withContext(t.db, ctxA(), async () => {
        throw new Error("business rollback");
      }),
    ).rejects.toThrow(/business rollback/);

    const after = await withContext(t.db, ctxA(), (tx) =>
      tx.select({ id: usageLedger.id }).from(usageLedger),
    );
    expect(after.length).toBe(before.length + 1);
  });

  it("forces RLS", async () => {
    const [row] = (
      await t.pg.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        `select c.relrowsecurity, c.relforcerowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = 'usage_ledger'`,
      )
    ).rows;
    expect(row).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });

  it("matches drizzle drift for usage_ledger", async () => {
    const dbColumns = await t.pg.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'usage_ledger' order by column_name`,
    );
    expect(dbColumns.rows.map((r) => r.column_name)).toEqual(
      expect.arrayContaining([
        "tenant_id",
        "provider",
        "model",
        "input_tokens",
        "output_tokens",
        "estimated_cost_micro_usd",
        "cost_basis",
        "status",
      ]),
    );
    // Smoke: raw select works under RLS.
    await withContext(t.db, ctxA(), (tx) => tx.execute(sql`select count(*) from usage_ledger`));
  });
});
