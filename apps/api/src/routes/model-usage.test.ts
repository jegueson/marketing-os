import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withContext } from "@marketing-os/db";
import { usageLedger } from "@marketing-os/db/schema";
import { FakeGateway } from "@marketing-os/model-gateway";
import { createHarness, provisionCustomer, type Harness, type ProvisionedCustomer, type TestUser } from "../testing/harness";

const DATA_KEY = btoa("0123456789abcdef0123456789abcdef");

describe("model usage and budget API", () => {
  let h: Harness;
  let sm: TestUser;
  let acme: ProvisionedCustomer;
  let usagePath: string;
  let budgetPath: string;
  let fake: FakeGateway;

  beforeEach(async () => {
    fake = new FakeGateway({
      models: [
        {
          id: "openai/gpt-4o-mini",
          displayName: "GPT-4o mini",
          provider: "openrouter",
          inputPriceMicroUsdPer1M: 150_000,
          outputPriceMicroUsdPer1M: 600_000,
        },
      ],
    });
    h = await createHarness({ createModelGateway: () => fake }, "self_hosted", { MOS_DATA_KEY: DATA_KEY });
    sm = await h.user("sm@example.com", "success_manager");
    acme = await provisionCustomer(h, sm, "Acme", "owner@acme.test");
    usagePath = `/api/v1/workspaces/${acme.workspaceId}/models/usage`;
    budgetPath = `/api/v1/workspaces/${acme.workspaceId}/models/budget`;
  });

  afterEach(() => h.close());

  it("returns ledger totals for this UTC month and hides another tenant", async () => {
    const now = new Date();
    const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15, 12));
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 12));
    await withContext(h.testDb.db, { tenantId: acme.tenantId, userId: acme.admin.id, staff: false }, (tx) =>
      tx.insert(usageLedger).values([
        ledgerRow(acme.tenantId, thisMonth, 40, 10, 20),
        ledgerRow(acme.tenantId, thisMonth, 60, 3, 4),
        ledgerRow(acme.tenantId, lastMonth, 999, 100, 100),
      ]),
    );

    const globex = await provisionCustomer(h, sm, "Globex", "owner@globex.test");
    await withContext(h.testDb.db, { tenantId: globex.tenantId, userId: globex.admin.id, staff: false }, (tx) =>
      tx.insert(usageLedger).values([ledgerRow(globex.tenantId, thisMonth, 5_000, 9, 9)]),
    );

    const res = await h.call<{
      totalCostMicroUsd: number;
      inputTokens: number;
      outputTokens: number;
      calls: number;
      budget: null;
    }>(usagePath, { token: acme.admin.token });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      totalCostMicroUsd: 100,
      inputTokens: 13,
      outputTokens: 24,
      calls: 2,
      budget: null,
    });
    expect(JSON.stringify(res.body)).not.toContain("5000");

    const foreign = await h.call(usagePath, { token: globex.admin.token });
    expect(foreign.status).toBe(403);
  });

  it("lets usage readers open the summary and blocks budget writes", async () => {
    expect((await h.call(usagePath, { token: sm.token })).status).toBe(200);
    expect(
      (
        await h.call(budgetPath, {
          method: "PUT",
          token: sm.token,
          body: { monthlyCapMicroUsd: 1_000, enforcement: "warn" },
        })
      ).status,
    ).toBe(403);

    await h.testDb.pg.query("update tenant_memberships set role = 'customer_user' where user_id = $1", [
      acme.admin.id,
    ]);
    expect((await h.call(usagePath, { token: acme.admin.token })).status).toBe(403);
    expect(
      (
        await h.call(budgetPath, {
          method: "PUT",
          token: acme.admin.token,
          body: { monthlyCapMicroUsd: 1_000, enforcement: "warn" },
        })
      ).status,
    ).toBe(403);
  });

  it("saves a hard cap only when the default model has a published price", async () => {
    const unpriced = await h.call(budgetPath, {
      method: "PUT",
      token: acme.admin.token,
      body: { monthlyCapMicroUsd: 1_000_000, enforcement: "hard" },
    });
    expect(unpriced.status).toBe(422);
    expect(unpriced.body.error?.code).toBe("invalid_request");

    await h.call(`/api/v1/workspaces/${acme.workspaceId}/models/settings`, {
      method: "PUT",
      token: acme.admin.token,
      body: { provider: "openrouter", apiKey: "sk-or-v1-fixture-settings-key", defaultModel: "openai/gpt-4o-mini" },
    });
    const saved = await h.call<{ monthlyCapMicroUsd: number; enforcement: string }>(budgetPath, {
      method: "PUT",
      token: acme.admin.token,
      body: { monthlyCapMicroUsd: 1_000_000, enforcement: "hard" },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toEqual({ monthlyCapMicroUsd: 1_000_000, enforcement: "hard" });
    expect(JSON.stringify(saved.body)).not.toContain("sk-or-v1-fixture-settings-key");

    const usage = await h.call<{ budget: { monthlyCapMicroUsd: number; enforcement: string }; totalCostMicroUsd: number }>(
      usagePath,
      { token: acme.admin.token },
    );
    expect(usage.body.data.budget).toEqual({ monthlyCapMicroUsd: 1_000_000, enforcement: "hard" });
    expect(usage.body.data.totalCostMicroUsd).toBe(0);
  });

  it("saves a warn cap without a priced model", async () => {
    const saved = await h.call<{ enforcement: string; monthlyCapMicroUsd: number }>(budgetPath, {
      method: "PUT",
      token: acme.admin.token,
      body: { monthlyCapMicroUsd: 50, enforcement: "warn" },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toEqual({ monthlyCapMicroUsd: 50, enforcement: "warn" });
    expect(fake.calls.listModels).toBe(0);
  });
});

function ledgerRow(
  tenantId: string,
  createdAt: Date,
  estimatedCostMicroUsd: number,
  inputTokens: number,
  outputTokens: number,
) {
  return {
    tenantId,
    purpose: "ask",
    provider: "openrouter" as const,
    model: "openai/gpt-4o-mini",
    inputTokens,
    outputTokens,
    estimatedCostMicroUsd,
    costBasis: "provider_list" as const,
    latencyMs: 1,
    status: "ok" as const,
    createdAt,
  };
}
