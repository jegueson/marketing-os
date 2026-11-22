import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { auditEvents, connectors, connections, metricDefinitions, metricValues, usageLedger } from "@marketing-os/db";
import { resolvePreset } from "@marketing-os/metrics/windows";
import { FakeGateway } from "@marketing-os/model-gateway";
import { createHarness, provisionCustomer, type Harness, type ProvisionedCustomer, type TestUser } from "../testing/harness";

const DATA_KEY = btoa("0123456789abcdef0123456789abcdef");
const API_KEY = "sk-or-v1-fixture-ask-message-key";
const SENTINEL = "SENTINEL-B-7f3a";
const B_VALUE = "999999";

const model = {
  id: "gpt-test",
  displayName: "GPT Test",
  provider: "openai_compatible" as const,
  inputPriceMicroUsdPer1M: 1_000_000,
  outputPriceMicroUsdPer1M: 1_000_000,
};

const plan = JSON.stringify({
  intent: "answerable",
  steps: [{ id: "s1", tool: "metric_value", metricKey: "mock.spend", range: "last_30_days" }],
});
const answer = JSON.stringify({
  observations: ["Spend was {{o1}}."],
  interpretation: "Within the selected range.",
});

describe("ask cross-tenant prompt leak", () => {
  let h: Harness;
  let fake: FakeGateway;
  const logs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    return h?.close();
  });

  it("keeps tenant B's sentinel out of tenant A's prompt, ledger, logs, audit, and response", async () => {
    fake = new FakeGateway({
      models: [model],
      completeScripts: [{ content: plan }, { content: answer }],
    });
    h = await createHarness({ createModelGateway: () => fake }, "self_hosted", { MOS_DATA_KEY: DATA_KEY });
    const sm: TestUser = await h.user("sm@example.com", "success_manager");
    const acme: ProvisionedCustomer = await provisionCustomer(h, sm, "Acme", "owner@acme.test");
    const globex: ProvisionedCustomer = await provisionCustomer(h, sm, "Globex", "owner@globex.test");
    await h.testDb.pg.query("update feature_flags set is_enabled = true where key = 'ask_marketing'");
    const saved = await h.call(`/api/v1/workspaces/${acme.workspaceId}/models/settings`, {
      method: "PUT",
      token: acme.admin.token,
      body: { provider: "openrouter", apiKey: API_KEY, defaultModel: model.id },
    });
    expect(saved.status).toBe(200);

    const [connector] = await h.testDb.db.select({ id: connectors.id }).from(connectors).where(eq(connectors.slug, "mock"));
    if (!connector) throw new Error("mock connector is not seeded");
    const [acmeConnection] = await h.testDb.db
      .insert(connections)
      .values({
        tenantId: acme.tenantId,
        workspaceId: acme.workspaceId,
        connectorId: connector.id,
        displayName: "Acme mock",
        status: "active",
        createdBy: acme.admin.id,
      })
      .returning({ id: connections.id });
    const [globexConnection] = await h.testDb.db
      .insert(connections)
      .values({
        tenantId: globex.tenantId,
        workspaceId: globex.workspaceId,
        connectorId: connector.id,
        displayName: SENTINEL,
        status: "active",
        createdBy: globex.admin.id,
      })
      .returning({ id: connections.id });
    await h.testDb.db.insert(metricDefinitions).values([
      {
        key: "mock.spend",
        source: "mock",
        version: "1",
        label: "Spend",
        unit: "currency",
        widgets: [],
      },
      {
        tenantId: globex.tenantId,
        key: "mock.sentinel_b",
        source: "mock",
        version: "1",
        label: SENTINEL,
        unit: "count",
        widgets: [],
      },
    ]);
    // The stored window counts only when it sits inside last_30_days, which moves with the clock.
    const range = resolvePreset("last_30_days", new Date());
    const windowStart = range.start;
    const windowEnd = range.end;
    await h.testDb.db.insert(metricValues).values([
      {
        tenantId: acme.tenantId,
        definitionKey: "mock.spend",
        definitionVersion: "1",
        periodStart: windowStart,
        periodEnd: windowEnd,
        dimensionHash: "mock-account-1",
        connectionId: acmeConnection?.id,
        value: "85",
        fetchedAt: windowEnd,
      },
      {
        tenantId: globex.tenantId,
        definitionKey: "mock.sentinel_b",
        definitionVersion: "1",
        periodStart: windowStart,
        periodEnd: windowEnd,
        dimensionHash: SENTINEL,
        connectionId: globexConnection?.id,
        value: B_VALUE,
        fetchedAt: windowEnd,
      },
    ]);

    const created = await h.call<{ id: string }>(`/api/v1/workspaces/${acme.workspaceId}/ask/conversations`, {
      method: "POST",
      token: acme.admin.token,
      body: { title: "Spend" },
    });
    expect(created.status).toBe(201);
    const spy = (method: "log" | "info" | "warn" | "error") =>
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logs.push(args.map((part) => (typeof part === "string" ? part : JSON.stringify(part))).join(" "));
      });
    spy("log");
    spy("info");
    spy("warn");
    spy("error");
    const posted = await h.call(`/api/v1/workspaces/${acme.workspaceId}/ask/conversations/${created.body.data.id}/messages`, {
      method: "POST",
      token: acme.admin.token,
      body: { content: "How much did we spend?" },
    });
    expect(posted.status).toBe(201);

    const prompts = fake.calls.complete.flatMap((call) => call.messages.map((message) => message.content)).join("\n");
    const ledger = await h.testDb.db.select().from(usageLedger).where(eq(usageLedger.tenantId, acme.tenantId));
    const audits = await h.testDb.db.select().from(auditEvents).where(eq(auditEvents.tenantId, acme.tenantId));
    const surfaces = {
      prompt: prompts,
      response: JSON.stringify(posted.body),
      ledger: JSON.stringify(ledger),
      audit: JSON.stringify(audits),
      log: logs.join("\n"),
    };
    for (const [name, text] of Object.entries(surfaces)) {
      expect(text, name).not.toContain(SENTINEL);
      expect(text, name).not.toContain(B_VALUE);
    }
    expect(prompts.length).toBeGreaterThan(0);
  }, 60_000);
});
