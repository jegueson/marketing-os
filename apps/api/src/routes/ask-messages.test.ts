import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { MockConnector } from "@marketing-os/connector-mock";
import { auditEvents, metricDefinitions, metricValues, usageLedger } from "@marketing-os/db";
import { FakeGateway } from "@marketing-os/model-gateway";
import { loadMetricsYaml } from "@marketing-os/metrics";
import { MemoryRateLimiter } from "../lib/abuse";
import { createHarness, provisionCustomer, type Harness, type ProvisionedCustomer, type TestUser } from "../testing/harness";
import { consumeSyncMessage, enqueueDueSyncs } from "../sync/engine";

const DATA_KEY = btoa("0123456789abcdef0123456789abcdef");
const API_KEY = "sk-or-v1-fixture-ask-message-key";
const QUESTION = "How much did we spend?";

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

function fakeGateway() {
  return new FakeGateway({
    models: [model],
    completeScripts: [{ content: plan }, { content: answer }],
  });
}

describe("ask messages API", () => {
  let h: Harness;
  let sm: TestUser;
  let acme: ProvisionedCustomer;
  let fake: FakeGateway;

  afterEach(() => h?.close());

  async function boot(extra: Parameters<typeof createHarness>[0] = {}) {
    fake = fakeGateway();
    h = await createHarness({ createModelGateway: () => fake, ...extra }, "self_hosted", { MOS_DATA_KEY: DATA_KEY });
    sm = await h.user("sm@example.com", "success_manager");
    acme = await provisionCustomer(h, sm, "Acme", "owner@acme.test");
    await h.testDb.pg.query("update feature_flags set is_enabled = true where key = 'ask_marketing'");
  }

  async function conversation(): Promise<string> {
    const created = await h.call<{ id: string }>(`/api/v1/workspaces/${acme.workspaceId}/ask/conversations`, {
      method: "POST",
      token: acme.admin.token,
      body: { title: "Spend" },
    });
    expect(created.status).toBe(201);
    return created.body.data.id;
  }

  function messages(id: string): string {
    return `/api/v1/workspaces/${acme.workspaceId}/ask/conversations/${id}/messages`;
  }

  async function saveModel(): Promise<void> {
    const saved = await h.call(`/api/v1/workspaces/${acme.workspaceId}/models/settings`, {
      method: "PUT",
      token: acme.admin.token,
      body: { provider: "openrouter", apiKey: API_KEY, defaultModel: model.id },
    });
    expect(saved.status).toBe(200);
  }

  it("returns an evidenced answer over mock-synced data and writes a ledger row", async () => {
    await boot();
    const created = await h.call<{ id: string }>(`/api/v1/workspaces/${acme.workspaceId}/connections`, {
      method: "POST",
      token: acme.admin.token,
      body: { connectorSlug: "mock", displayName: "Mock data" },
    });
    const connectionId = created.body.data.id;
    await h.call(`/api/v1/workspaces/${acme.workspaceId}/connections/${connectionId}/scopes`, {
      method: "PUT",
      token: acme.admin.token,
      body: { resources: [{ resourceType: "account", resourceId: "mock-account-1" }] },
    });
    const queued = (await enqueueDueSyncs(h.testDb.db)).filter((message) => message.connectionId === connectionId);
    const connectors = new Map([["mock", new MockConnector()]]);
    for (const message of queued) {
      expect(await consumeSyncMessage(h.testDb.db, message, connectors)).toBe("ack");
    }
    const catalog = loadMetricsYaml(
      join(dirname(fileURLToPath(import.meta.url)), "../../../../customer-configs/_templates/metrics.yaml"),
    );
    await h.testDb.db.insert(metricDefinitions).values(
      catalog.definitions.map((definition) => ({
        key: definition.key,
        source: definition.source,
        version: definition.version,
        label: definition.label,
        unit: definition.unit ?? null,
        formula: definition.formula ?? null,
        target: definition.target == null ? null : String(definition.target),
        widgets: definition.widgets ?? [],
      })),
    );
    await saveModel();
    const before = await h.testDb.db.select({ id: metricValues.id }).from(metricValues);
    const id = await conversation();
    const posted = await h.call<{
      observations: string[];
      observed: { value: number | null; definitionVersion: string }[];
    }>(messages(id), { method: "POST", token: acme.admin.token, body: { content: QUESTION } });
    expect(posted.status).toBe(201);
    expect(posted.body.data.observations).toEqual(["mock.spend: 2550"]);
    expect(posted.body.data.observed[0]).toMatchObject({ value: 2550, definitionVersion: "1" });
    expect(JSON.stringify(posted.body)).not.toContain(API_KEY);
    const after = await h.testDb.db.select({ id: metricValues.id }).from(metricValues);
    expect(after).toHaveLength(before.length);
    const ledger = await h.testDb.db.select().from(usageLedger).where(eq(usageLedger.tenantId, acme.tenantId));
    expect(ledger.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(ledger)).not.toContain(QUESTION);
    const audits = await h.testDb.db.select().from(auditEvents).where(eq(auditEvents.eventType, "ask.message_created"));
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0]?.payload)).toContain("questionHash");
    expect(JSON.stringify(audits)).not.toContain(QUESTION);
  }, 60_000);

  it("returns 422 when no model key is configured", async () => {
    await boot();
    const id = await conversation();
    const posted = await h.call(messages(id), { method: "POST", token: acme.admin.token, body: { content: QUESTION } });
    expect(posted.status).toBe(422);
    expect(posted.body.error?.code).toBe("model_not_configured");
    expect(fake.calls.complete).toHaveLength(0);
  });

  it("returns 402 when the hard budget is already spent", async () => {
    await boot();
    await saveModel();
    const budget = await h.call(`/api/v1/workspaces/${acme.workspaceId}/models/budget`, {
      method: "PUT",
      token: acme.admin.token,
      body: { monthlyCapMicroUsd: 0, enforcement: "hard" },
    });
    expect(budget.status).toBe(200);
    const before = fake.calls.complete.length;
    const id = await conversation();
    const posted = await h.call(messages(id), { method: "POST", token: acme.admin.token, body: { content: QUESTION } });
    expect(posted.status).toBe(402);
    expect(posted.body.error?.code).toBe("budget_exceeded");
    expect(fake.calls.complete).toHaveLength(before);
  });

  it("returns 429 when the ask rate limiter is exhausted", async () => {
    await boot({ askRateLimiter: () => new MemoryRateLimiter(0, 60_000) });
    await saveModel();
    const id = await conversation();
    const posted = await h.call(messages(id), { method: "POST", token: acme.admin.token, body: { content: QUESTION } });
    expect(posted.status).toBe(429);
    expect(posted.body.error?.code).toBe("rate_limited");
    expect(fake.calls.complete).toHaveLength(0);
  });
});
