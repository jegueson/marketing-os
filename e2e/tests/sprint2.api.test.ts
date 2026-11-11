/**
 * Sprint 2 exit journey on the local stack: mock connect, sync, eight KPIs
 * with lineage, revoked-token reconnect, and cross-tenant denial.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockConnector } from "../../connectors/mock/src/index";
import { loadMetricsYaml } from "../../packages/metrics/src/index";
import { metricDefinitions } from "../../packages/db/src/schema/index";
import { consumeSyncMessage, type SyncMessage } from "../../apps/api/src/sync/engine";
import { createHarness, provisionCustomer, type Harness } from "../../apps/api/src/testing/harness";

const DATA_KEY = btoa("0123456789abcdef0123456789abcdef");
const KPI_KEYS = [
  "AdsConversions",
  "CostPerSession",
  "KeyEvents",
  "LeadCAC",
  "Leads",
  "QualifiedLeadCAC",
  "Sessions",
  "Spend",
];

type Card = { key: string; value: number | null; definitionVersion: string | null; source: string };
type Widgets = { executive: Card[]; performance: Card[]; funnel: Card[]; leads: Card[] };

function cardsOf(widgets: Widgets): Card[] {
  const byKey = new Map<string, Card>();
  for (const card of [...widgets.executive, ...widgets.performance, ...widgets.funnel, ...widgets.leads]) {
    byKey.set(card.key, card);
  }
  return [...byKey.values()];
}

describe("sprint 2 journey", () => {
  let h: Harness;
  const queued: SyncMessage[] = [];

  beforeEach(async () => {
    queued.length = 0;
    h = await createHarness(
      { syncQueue: { sendBatch: async (messages) => queued.push(...messages) } },
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

  it("connects the mock source, syncs, and shows eight KPIs with lineage", async () => {
    const sm = await h.user("sm@example.com", "success_manager");
    const acme = await provisionCustomer(h, sm, "Acme", "owner@acme.test");
    const globex = await provisionCustomer(h, sm, "Globex", "owner@globex.test");
    const base = `/api/v1/workspaces/${acme.workspaceId}`;

    const created = await h.call<{ id: string }>(`${base}/connections`, {
      method: "POST",
      body: { connectorSlug: "mock", displayName: "Mock data" },
      token: acme.admin.token,
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    const blocked = await h.call(`${base}/connections/${id}/sync`, { method: "POST", token: acme.admin.token });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error?.code).toBe("no_scopes_selected");

    await h.call(`${base}/connections/${id}/scopes`, {
      method: "PUT",
      body: { resources: [{ resourceType: "account", resourceId: "mock-account-1", resourceName: "Demo Ads Account" }] },
      token: acme.admin.token,
    });
    const sync = await h.call<{ runs: number }>(`${base}/connections/${id}/sync`, {
      method: "POST",
      token: acme.admin.token,
    });
    expect(sync.status).toBe(202);
    expect(sync.body.data.runs).toBe(3);
    expect(queued).toHaveLength(3);
    for (const message of queued) {
      expect(await consumeSyncMessage(h.testDb.db, message, new Map([["mock", mockConnector]]))).toBe("ack");
    }

    const cockpit = await h.call<{ widgets: Widgets }>(`${base}/cockpit`, { token: acme.admin.token });
    expect(cockpit.status).toBe(200);
    const cards = cardsOf(cockpit.body.data.widgets);
    expect(cards.map((card) => card.key).sort()).toEqual(KPI_KEYS);
    expect(cards.every((card) => card.definitionVersion === "1" && card.value != null)).toBe(true);
    expect(JSON.stringify(cockpit.body)).not.toContain("rt-secret");

    expect((await h.call(`${base}/cockpit`, { token: globex.admin.token })).status).toBe(403);
    expect((await h.call(`${base}/connections/${id}/sync`, { method: "POST", token: globex.admin.token })).status).toBe(403);
    const globexCockpit = await h.call<{ widgets: Widgets }>(`/api/v1/workspaces/${globex.workspaceId}/cockpit`, {
      token: globex.admin.token,
    });
    expect(cardsOf(globexCockpit.body.data.widgets)).toEqual([]);
  });

  it("reconnects a revoked mock token without returning the refresh token", async () => {
    const sm = await h.user("sm@example.com", "success_manager");
    const acme = await provisionCustomer(h, sm, "Acme", "owner@acme.test");
    const base = `/api/v1/workspaces/${acme.workspaceId}`;
    const created = await h.call<{ id: string }>(`${base}/connections`, {
      method: "POST",
      body: { connectorSlug: "mock", displayName: "Mock data" },
      token: acme.admin.token,
    });
    const id = created.body.data.id;
    const started = await h.call<{ authorizationUrl: string }>(`${base}/connections/${id}/oauth/start`, {
      method: "POST",
      token: acme.admin.token,
    });
    expect(started.status).toBe(200);
    expect(JSON.stringify(started.body)).not.toContain("code_verifier");
    const state = new URL(started.body.data.authorizationUrl).searchParams.get("state");
    const callback = await h.request(`/api/v1/integrations/oauth/callback?code=grant-revoked&state=${state}`);
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location") ?? "").not.toContain("refresh");

    const refreshed = await h.call(`${base}/connections/${id}/oauth/refresh`, {
      method: "POST",
      token: acme.admin.token,
    });
    expect(refreshed.status).toBe(409);
    expect(refreshed.body.error?.code).toBe("access_revoked");
    expect(JSON.stringify(refreshed.body)).not.toContain("refresh-revoked");
    const { rows } = await h.testDb.pg.query<{ status: string; ciphertext: string }>(
      `select c.status, r.ciphertext
         from connections c
         join credential_references r on r.connection_id = c.id
        where c.id = $1`,
      [id],
    );
    expect(rows[0]?.status).toBe("expired");
    expect(rows[0]?.ciphertext).not.toContain("refresh-revoked");
  });
});
