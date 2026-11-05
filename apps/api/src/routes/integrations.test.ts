import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockConnector } from "@marketing-os/connector-mock";
import type { HealthResult } from "@marketing-os/connector-sdk";
import { createHarness, provisionCustomer, type Harness, type ProvisionedCustomer, type TestUser } from "../testing/harness";

class UnhealthyConnector extends MockConnector {
  override async health(): Promise<HealthResult> {
    return { status: "error", checkedAt: new Date().toISOString(), message: "Token revoked. Reconnect." };
  }
}

describe("connections, cockpit and onboarding", () => {
  let h: Harness;
  let sm: TestUser;
  let acme: ProvisionedCustomer;
  let base: string;

  beforeEach(async () => {
    h = await createHarness();
    sm = await h.user("sm@example.com", "success_manager");
    acme = await provisionCustomer(h, sm, "Acme", "owner@acme.test");
    base = `/api/v1/workspaces/${acme.workspaceId}`;
  });
  afterEach(() => h.close());

  const createConnection = (token = acme.admin.token) =>
    h.call<{ id: string; status: string; scopes: number }>(`${base}/connections`, {
      method: "POST",
      body: { connectorSlug: "mock", displayName: "Mock data" },
      token,
    });

  it("lists the catalog with the mock available and real connectors coming soon", async () => {
    const res = await h.call<{ slug: string; status: string }[]>(`${base}/integrations`, { token: acme.admin.token });
    expect(res.body.data.find((c) => c.slug === "mock")?.status).toBe("available");
    expect(res.body.data.find((c) => c.slug === "hubspot")?.status).toBe("coming_soon");
  });

  it("creates a pending connection with no scopes selected", async () => {
    const res = await createConnection();
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: "pending", scopes: 0 });
  });

  it("fails the test with an actionable code before scopes are chosen", async () => {
    const conn = await createConnection();
    const res = await h.call(`${base}/connections/${conn.body.data.id}/test`, { method: "POST", token: acme.admin.token });
    expect(res.status).toBe(422);
    expect(res.body.error?.code).toBe("no_scopes_selected");
    const { rows } = await h.testDb.pg.query("select 1 from outbox_events where event_type = 'integration.failed'");
    expect(rows).toHaveLength(1);
  });

  it("rejects scopes the connector does not offer", async () => {
    const conn = await createConnection();
    const res = await h.call(`${base}/connections/${conn.body.data.id}/scopes`, {
      method: "PUT",
      body: { resources: [{ resourceType: "account", resourceId: "someone-elses-account" }] },
      token: acme.admin.token,
    });
    expect(res.status).toBe(422);
  });

  it("connects after selecting accounts and feeds cockpit data health", async () => {
    const empty = await h.call<{ empty_state: unknown; header: { freshness: string } }>(`${base}/cockpit`, {
      token: acme.admin.token,
    });
    expect(empty.body.data.header.freshness).toBe("empty");
    expect(empty.body.data.empty_state).not.toBeNull();

    const conn = await createConnection();
    const id = conn.body.data.id;
    const resources = await h.call<{ resourceType: string; resourceId: string; selected: boolean }[]>(
      `${base}/connections/${id}/resources`,
      { token: acme.admin.token },
    );
    const account = resources.body.data.find((r) => r.resourceType === "account");
    expect(account?.selected).toBe(false);
    const scoped = await h.call(`${base}/connections/${id}/scopes`, {
      method: "PUT",
      body: { resources: [{ resourceType: "account", resourceId: account!.resourceId }] },
      token: acme.admin.token,
    });
    expect(scoped.status).toBe(200);

    const tested = await h.call<{ healthy: boolean }>(`${base}/connections/${id}/test`, {
      method: "POST",
      token: acme.admin.token,
    });
    expect(tested.status).toBe(200);
    expect(tested.body.data.healthy).toBe(true);

    const cockpit = await h.call<{
      header: { workspaceName: string; freshness: string };
      data_health: { status: string; health: string; scopes: number }[];
      empty_state: unknown;
    }>(`${base}/cockpit`, { token: acme.admin.token });
    expect(cockpit.body.data.header).toMatchObject({ workspaceName: "Default", freshness: "live" });
    expect(cockpit.body.data.data_health).toEqual([
      expect.objectContaining({ status: "active", health: "healthy", scopes: 1 }),
    ]);
    expect(cockpit.body.data.empty_state).toBeNull();

    const { rows } = await h.testDb.pg.query<{ event_type: string }>(
      "select event_type from audit_events where resource_id = $1 order by id",
      [id],
    );
    expect(rows.map((r) => r.event_type)).toEqual([
      "integration.created",
      "integration.scopes_changed",
      "integration.connected",
    ]);

    const removed = await h.call(`${base}/connections/${id}`, { method: "DELETE", token: acme.admin.token });
    expect(removed.status).toBe(200);
    const after = await h.call<unknown[]>(`${base}/connections`, { token: acme.admin.token });
    expect(after.body.data).toEqual([]);
  });

  it("marks the connection in error when the provider is unhealthy", async () => {
    const unhealthy = await createHarness({ connectors: new Map([["mock", new UnhealthyConnector()]]) });
    const staff = await unhealthy.user("sm@example.com", "success_manager");
    const customer = await provisionCustomer(unhealthy, staff, "Globex", "owner@globex.test");
    const path = `/api/v1/workspaces/${customer.workspaceId}`;
    const conn = await unhealthy.call<{ id: string }>(`${path}/connections`, {
      method: "POST",
      body: { connectorSlug: "mock", displayName: "Mock" },
      token: customer.admin.token,
    });
    await unhealthy.call(`${path}/connections/${conn.body.data.id}/scopes`, {
      method: "PUT",
      body: { resources: [{ resourceType: "account", resourceId: "mock-account-1" }] },
      token: customer.admin.token,
    });
    const res = await unhealthy.call(`${path}/connections/${conn.body.data.id}/test`, {
      method: "POST",
      token: customer.admin.token,
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: "connector_unhealthy", message: "Token revoked. Reconnect." });
    const cockpit = await unhealthy.call<{ data_health: { status: string; health: string }[] }>(`${path}/cockpit`, {
      token: customer.admin.token,
    });
    expect(cockpit.body.data.data_health[0]).toMatchObject({ status: "error", health: "error" });
    await unhealthy.close();
  });

  it("blocks other tenants and users without integrations:manage", async () => {
    const globex = await provisionCustomer(h, sm, "Globex", "owner@globex.test");
    expect((await h.call(`${base}/connections`, { token: globex.admin.token })).status).toBe(403);
    expect((await h.call(`${base}/cockpit`, { token: globex.admin.token })).status).toBe(403);

    await h.testDb.pg.query(
      "update tenant_memberships set role = 'customer_user' where user_id = $1",
      [acme.admin.id],
    );
    expect((await createConnection()).status).toBe(403);
    expect((await h.call(`${base}/connections`, { token: acme.admin.token })).status).toBe(200);
  });

  it("lets the assigned success manager open the customer workspace", async () => {
    expect((await h.call(`${base}/cockpit`, { token: sm.token })).status).toBe(200);
    const stranger = await h.user("other-sm@example.com", "success_manager");
    expect((await h.call(`${base}/cockpit`, { token: stranger.token })).status).toBe(403);
  });

  it("returns the onboarding checklist and updates items", async () => {
    const onboarding = await h.call<{ status: string; items: { id: string; key: string; status: string }[] }>(
      `${base}/onboarding`,
      { token: acme.admin.token },
    );
    expect(onboarding.status).toBe(200);
    const [first] = onboarding.body.data.items;
    const updated = await h.call<{ status: string }>(`${base}/onboarding/items/${first!.id}`, {
      method: "PATCH",
      body: { status: "completed" },
      token: acme.admin.token,
    });
    expect(updated.body.data.status).toBe("completed");
    const bad = await h.call(`${base}/onboarding/items/${first!.id}`, {
      method: "PATCH",
      body: { status: "done" },
      token: acme.admin.token,
    });
    expect(bad.status).toBe(422);
  });
});
