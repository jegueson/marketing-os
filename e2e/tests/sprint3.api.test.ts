/**
 * Sprint 3 exit journey on the local stack: stub model, mock sync, evidenced
 * ask, history, hard budget block, and cross-tenant denial.
 * The browser check is in sprint1.spec.ts: Ask stays hidden while the flag is off.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockConnector } from "../../connectors/mock/src/index";
import { FakeGateway } from "../../packages/model-gateway/src/index";
import { loadMetricsYaml } from "../../packages/metrics/src/index";
import { metricDefinitions } from "../../packages/db/src/schema/index";
import { consumeSyncMessage, type SyncMessage } from "../../apps/api/src/sync/engine";
import { createHarness, provisionCustomer, type Harness } from "../../apps/api/src/testing/harness";

const DATA_KEY = btoa("0123456789abcdef0123456789abcdef");
const API_KEY = "sk-or-v1-fixture-sprint3-journey";
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

describe("sprint 3 journey", () => {
  let h: Harness;
  let fake: FakeGateway;
  const queued: SyncMessage[] = [];

  beforeEach(async () => {
    queued.length = 0;
    fake = new FakeGateway({
      models: [model],
      completeScripts: [{ content: plan }, { content: answer }],
    });
    h = await createHarness(
      {
        createModelGateway: () => fake,
        syncQueue: { sendBatch: async (messages) => queued.push(...messages) },
      },
      "self_hosted",
      { MOS_DATA_KEY: DATA_KEY },
    );
    const catalog = loadMetricsYaml(
      join(dirname(fileURLToPath(import.meta.url)), "../../customer-configs/_templates/metrics.yaml"),
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
  });

  afterEach(() => h.close());

  it("answers from mock data, keeps history, blocks a hard budget, and hides the other tenant", async () => {
    const sm = await h.user("sm@example.com", "success_manager");
    const acme = await provisionCustomer(h, sm, "Acme", "owner@acme.test");
    const globex = await provisionCustomer(h, sm, "Globex", "owner@globex.test");
    const base = `/api/v1/workspaces/${acme.workspaceId}`;

    const settings = await h.call(`${base}/models/settings`, {
      method: "PUT",
      token: acme.admin.token,
      body: { provider: "openrouter", apiKey: API_KEY, defaultModel: model.id },
    });
    expect(settings.status).toBe(200);
    expect(JSON.stringify(settings.body)).not.toContain(API_KEY);

    const created = await h.call<{ id: string }>(`${base}/connections`, {
      method: "POST",
      body: { connectorSlug: "mock", displayName: "Mock data" },
      token: acme.admin.token,
    });
    expect(created.status).toBe(201);
    const connectionId = created.body.data.id;
    await h.call(`${base}/connections/${connectionId}/scopes`, {
      method: "PUT",
      body: { resources: [{ resourceType: "account", resourceId: "mock-account-1" }] },
      token: acme.admin.token,
    });
    const sync = await h.call<{ runs: number }>(`${base}/connections/${connectionId}/sync`, {
      method: "POST",
      token: acme.admin.token,
    });
    expect(sync.status).toBe(202);
    expect(sync.body.data.runs).toBe(3);
    for (const message of queued) {
      expect(await consumeSyncMessage(h.testDb.db, message, new Map([["mock", mockConnector]]))).toBe("ack");
    }

    await h.testDb.pg.query("update feature_flags set is_enabled = true where key = 'ask_marketing'");
    const conversation = await h.call<{ id: string }>(`${base}/ask/conversations`, {
      method: "POST",
      token: acme.admin.token,
      body: { title: "Spend" },
    });
    expect(conversation.status).toBe(201);
    const conversationId = conversation.body.data.id;

    const posted = await h.call<{
      observations: string[];
      observed: { value: number | null; definitionVersion: string }[];
    }>(`${base}/ask/conversations/${conversationId}/messages`, {
      method: "POST",
      token: acme.admin.token,
      body: { content: QUESTION },
    });
    expect(posted.status).toBe(201);
    expect(posted.body.data.observations).toEqual(["mock.spend: 2550"]);
    expect(posted.body.data.observed[0]).toMatchObject({ value: 2550, definitionVersion: "1" });
    expect(JSON.stringify(posted.body)).not.toContain(API_KEY);
    expect(fake.calls.complete.length).toBeGreaterThan(0);

    const history = await h.call<{ messages: { role: string; content: string }[] }>(
      `${base}/ask/conversations/${conversationId}`,
      { token: acme.admin.token },
    );
    expect(history.status).toBe(200);
    expect(history.body.data.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(history.body.data.messages[0]?.content).toBe(QUESTION);
    expect(history.body.data.messages[1]?.content).toContain("2550");

    const { rows } = await h.testDb.pg.query<{ payload: { questionHash?: string } }>(
      "select payload from audit_events where event_type = 'ask.message_created' and tenant_id = $1",
      [acme.tenantId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload.questionHash).toEqual(expect.any(String));
    expect(JSON.stringify(rows)).not.toContain(QUESTION);

    const before = fake.calls.complete.length;
    const budget = await h.call(`${base}/models/budget`, {
      method: "PUT",
      token: acme.admin.token,
      body: { monthlyCapMicroUsd: 0, enforcement: "hard" },
    });
    expect(budget.status).toBe(200);
    const blocked = await h.call(`${base}/ask/conversations/${conversationId}/messages`, {
      method: "POST",
      token: acme.admin.token,
      body: { content: "How many sessions did we have?" },
    });
    expect(blocked.status).toBe(402);
    expect(blocked.body.error?.code).toBe("budget_exceeded");
    expect(fake.calls.complete).toHaveLength(before);

    expect((await h.call(`${base}/ask/conversations`, { token: globex.admin.token })).status).toBe(403);
    expect(
      (
        await h.call(`${base}/ask/conversations/${conversationId}/messages`, {
          method: "POST",
          token: globex.admin.token,
          body: { content: QUESTION },
        })
      ).status,
    ).toBe(403);
    expect((await h.call(`${base}/ask/conversations/${conversationId}`, { token: globex.admin.token })).status).toBe(403);
  }, 60_000);
});
