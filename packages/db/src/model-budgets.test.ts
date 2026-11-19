import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withContext, type DbContext } from "./context";
import { loadBudgetSnapshot, saveModelBudget } from "./model-budgets";
import { tenantMemberships, tenants, usageLedger } from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
const ids = {
  tenantA: crypto.randomUUID(),
  tenantB: crypto.randomUUID(),
  userA: "",
  userB: "",
};

const ctxA = (): DbContext => ({ tenantId: ids.tenantA, userId: ids.userA, staff: false });
const ctxB = (): DbContext => ({ tenantId: ids.tenantB, userId: ids.userB, staff: false });
const now = new Date("2026-11-16T12:00:00.000Z");

beforeAll(async () => {
  t = await createTestDatabase();
  ids.userA = await t.createUser("budget-a@example.com");
  ids.userB = await t.createUser("budget-b@example.com");
  await withContext(t.db, { tenantId: ids.tenantA, userId: ids.userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: ids.tenantA, slug: "budget-a", name: "Budget A" });
    await tx.insert(tenantMemberships).values({
      tenantId: ids.tenantA,
      userId: ids.userA,
      role: "customer_admin",
    });
  });
  await withContext(t.db, { tenantId: ids.tenantB, userId: ids.userB, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: ids.tenantB, slug: "budget-b", name: "Budget B" });
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

describe("model_budgets", () => {
  it("rejects a hard cap when the model price is unknown", async () => {
    await expect(
      withContext(t.db, ctxA(), (tx) =>
        saveModelBudget(tx, {
          tenantId: ids.tenantA,
          monthlyCapMicroUsd: 1_000_000,
          enforcement: "hard",
          costBasis: "unknown",
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid_request", status: 422 });

    const snapshot = await withContext(t.db, ctxA(), (tx) => loadBudgetSnapshot(tx, ids.tenantA, now));
    expect(snapshot.budget).toBeNull();
  });

  it("saves a hard cap for a priced model and a warn cap for an unpriced model", async () => {
    await withContext(t.db, ctxA(), (tx) =>
      saveModelBudget(tx, {
        tenantId: ids.tenantA,
        monthlyCapMicroUsd: 1_000_000,
        enforcement: "hard",
        costBasis: "provider_list",
      }),
    );
    await withContext(t.db, ctxB(), (tx) =>
      saveModelBudget(tx, {
        tenantId: ids.tenantB,
        monthlyCapMicroUsd: 50,
        enforcement: "warn",
        costBasis: "unknown",
      }),
    );

    const saved = await withContext(t.db, ctxA(), (tx) => loadBudgetSnapshot(tx, ids.tenantA, now));
    expect(saved.budget).toEqual({ monthlyCapMicroUsd: 1_000_000, enforcement: "hard" });
  });

  it("counts only the current UTC month toward the cap", async () => {
    await withContext(t.db, ctxA(), async (tx) => {
      await tx.insert(usageLedger).values([
        ledgerRow(new Date("2026-10-15T12:00:00.000Z"), 500),
        ledgerRow(new Date("2026-11-02T00:00:00.000Z"), 70),
        ledgerRow(new Date("2026-11-30T23:00:00.000Z"), 30),
        ledgerRow(new Date("2026-12-01T00:00:00.000Z"), 900),
      ]);
      await tx.insert(usageLedger).values({
        ...ledgerRow(new Date("2026-11-10T00:00:00.000Z"), null),
        estimatedCostMicroUsd: null,
      });
    });

    const snapshot = await withContext(t.db, ctxA(), (tx) => loadBudgetSnapshot(tx, ids.tenantA, now));
    expect(snapshot.monthSpendMicroUsd).toBe(100);

    const other = await withContext(t.db, ctxB(), (tx) => loadBudgetSnapshot(tx, ids.tenantB, now));
    expect(other.monthSpendMicroUsd).toBe(0);
    expect(other.budget).toEqual({ monthlyCapMicroUsd: 50, enforcement: "warn" });
  });
});

function ledgerRow(createdAt: Date, estimatedCostMicroUsd: number | null) {
  return {
    tenantId: ids.tenantA,
    purpose: "ask",
    provider: "openrouter" as const,
    model: "openai/gpt-4o-mini",
    inputTokens: 1,
    outputTokens: 1,
    estimatedCostMicroUsd,
    costBasis: "provider_list" as const,
    latencyMs: 1,
    status: "ok" as const,
    createdAt,
  };
}
