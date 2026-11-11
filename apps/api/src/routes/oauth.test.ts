import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHarness, provisionCustomer, type Harness, type ProvisionedCustomer, type TestUser } from "../testing/harness";

const DATA_KEY = btoa("0123456789abcdef0123456789abcdef");

describe("oauth", () => {
  let h: Harness;
  let sm: TestUser;
  let acme: ProvisionedCustomer;
  let base: string;

  beforeEach(async () => {
    h = await createHarness({}, "self_hosted", { MOS_DATA_KEY: DATA_KEY });
    sm = await h.user("sm@example.com", "success_manager");
    acme = await provisionCustomer(h, sm, "Acme", "owner@acme.test");
    base = `/api/v1/workspaces/${acme.workspaceId}`;
  });
  afterEach(() => h.close());

  async function connectionId(): Promise<string> {
    const created = await h.call<{ id: string }>(`${base}/connections`, {
      method: "POST",
      body: { connectorSlug: "mock", displayName: "Mock data" },
      token: acme.admin.token,
    });
    expect(created.status).toBe(201);
    return created.body.data.id;
  }

  it("requires integrations:manage and does not return a refresh token", async () => {
    const id = await connectionId();
    await h.testDb.pg.query("update tenant_memberships set role = 'customer_user' where user_id = $1", [acme.admin.id]);
    const denied = await h.call(`${base}/connections/${id}/oauth/start`, { method: "POST", token: acme.admin.token });
    expect(denied.status).toBe(403);

    await h.testDb.pg.query("update tenant_memberships set role = 'customer_admin' where user_id = $1", [acme.admin.id]);
    const started = await h.call<{ authorizationUrl: string }>(`${base}/connections/${id}/oauth/start`, {
      method: "POST",
      token: acme.admin.token,
    });
    expect(started.status).toBe(200);
    expect(started.body.data.authorizationUrl).toContain("code_challenge_method=S256");
    expect(JSON.stringify(started.body)).not.toContain("code_verifier");
    expect(JSON.stringify(started.body)).not.toContain("rt-secret");
  });

  it("rejects a replayed or expired state and refreshes without leaking the token", async () => {
    const id = await connectionId();
    const started = await h.call<{ authorizationUrl: string }>(`${base}/connections/${id}/oauth/start`, {
      method: "POST",
      token: acme.admin.token,
    });
    const state = new URL(started.body.data.authorizationUrl).searchParams.get("state");
    const callback = await h.request(`/api/v1/integrations/oauth/callback?code=good&state=${state}`);
    expect(callback.status).toBe(302);
    const location = callback.headers.get("location") ?? "";
    expect(location).toContain("oauth=connected");
    expect(location).not.toContain("rt-secret");
    expect(location).not.toContain("refresh_token");

    const replay = await h.call(`/api/v1/integrations/oauth/callback?code=good&state=${state}`);
    expect(replay.status).toBe(409);

    const refreshed = await h.call<{ refreshed: true }>(`${base}/connections/${id}/oauth/refresh`, {
      method: "POST",
      token: acme.admin.token,
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data).toEqual({ refreshed: true });
    expect(JSON.stringify(refreshed.body)).not.toContain("rt-secret");

    await h.testDb.pg.query("update oauth_states set consumed_at = null, expires_at = now() - interval '1 minute'");
    const expired = await h.call(`/api/v1/integrations/oauth/callback?code=good&state=${state}`);
    expect(expired.status).toBe(422);
    expect(expired.body.error?.message).toMatch(/expired/);
  });

  it("maps a revoked refresh to a typed error and marks the connection expired", async () => {
    const id = await connectionId();
    const started = await h.call<{ authorizationUrl: string }>(`${base}/connections/${id}/oauth/start`, {
      method: "POST",
      token: acme.admin.token,
    });
    const state = new URL(started.body.data.authorizationUrl).searchParams.get("state");
    const callback = await h.request(`/api/v1/integrations/oauth/callback?code=grant-revoked&state=${state}`);
    expect(callback.status).toBe(302);

    const refreshed = await h.call(`${base}/connections/${id}/oauth/refresh`, {
      method: "POST",
      token: acme.admin.token,
    });
    expect(refreshed.status).toBe(409);
    expect(refreshed.body.error?.code).toBe("access_revoked");
    expect(JSON.stringify(refreshed.body)).not.toContain("refresh-revoked");
    const { rows } = await h.testDb.pg.query<{ status: string }>("select status from connections where id = $1", [id]);
    expect(rows[0]?.status).toBe("expired");
  });
});
