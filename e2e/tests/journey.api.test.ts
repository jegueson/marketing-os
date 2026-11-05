/**
 * API-level Sprint 1 journey on real Postgres (PGlite with every migration),
 * real JWT verification and the real outbox relay and consumer.
 * Browser journeys live in the Playwright specs.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { consumeBatch } from "../../apps/api/src/events/consumer";
import { relayOutbox, type OutboxMessage } from "../../apps/api/src/events/relay";
import {
  createHarness,
  provisionCustomer,
  type Harness,
} from "../../apps/api/src/testing/harness";

describe("sprint 1 journey", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness({}, "cloud");
  });
  afterEach(() => h.close());

  it("lead to cockpit, with onboarding updated by the event pipeline", async () => {
    const sm = await h.user("sm@example.com", "success_manager");
    const acme = await provisionCustomer(h, sm, "Acme", "owner@acme.test");
    const base = `/api/v1/workspaces/${acme.workspaceId}`;

    const me = await h.call<{ memberships: { workspaceId: string; role: string }[] }>("/api/v1/me", {
      token: acme.admin.token,
    });
    expect(me.body.data.memberships).toEqual([
      expect.objectContaining({ workspaceId: acme.workspaceId, role: "customer_admin" }),
    ]);

    const conn = await h.call<{ id: string }>(`${base}/connections`, {
      method: "POST",
      body: { connectorSlug: "mock", displayName: "Mock data" },
      token: acme.admin.token,
    });
    await h.call(`${base}/connections/${conn.body.data.id}/scopes`, {
      method: "PUT",
      body: { resources: [{ resourceType: "account", resourceId: "mock-account-1" }] },
      token: acme.admin.token,
    });
    const tested = await h.call(`${base}/connections/${conn.body.data.id}/test`, {
      method: "POST",
      token: acme.admin.token,
    });
    expect(tested.status).toBe(200);

    const sent: OutboxMessage[] = [];
    await relayOutbox(h.testDb.db, { sendBatch: async (batch) => sent.push(...[...batch].map((m) => m.body)) });
    await consumeBatch(
      h.testDb.db,
      sent.map((body) => ({ body, ack: () => {}, retry: () => {} })),
    );

    const onboarding = await h.call<{ items: { key: string; status: string }[] }>(`${base}/onboarding`, {
      token: acme.admin.token,
    });
    expect(onboarding.body.data.items.find((i) => i.key === "connect_source")?.status).toBe("completed");

    const cockpit = await h.call<{ header: { freshness: string }; data_health: unknown[] }>(`${base}/cockpit`, {
      token: acme.admin.token,
    });
    expect(cockpit.body.data.header.freshness).toBe("live");
    expect(cockpit.body.data.data_health).toHaveLength(1);

    const features = await h.call<Record<string, boolean>>("/api/v1/me/features", { token: sm.token });
    expect(features.body.data["nav.leads_admin"]).toBe(true);
  });

  it("customer A cannot read customer B", async () => {
    const sm = await h.user("sm@example.com", "success_manager");
    const acme = await provisionCustomer(h, sm, "Acme", "owner@acme.test");
    const globex = await provisionCustomer(h, sm, "Globex", "owner@globex.test");
    for (const path of ["cockpit", "connections", "onboarding", "integrations"]) {
      const res = await h.call(`/api/v1/workspaces/${globex.workspaceId}/${path}`, { token: acme.admin.token });
      expect(res.status, path).toBe(403);
    }
    expect((await h.call("/api/v1/leads", { token: acme.admin.token })).status).toBe(403);
    expect((await h.call(`/api/v1/console/customers/${globex.tenantId}`, { token: acme.admin.token })).status).toBe(403);
  });
});
