import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tenantMemberships } from "@marketing-os/db";
import { createHarness, provisionCustomer, type Harness, type ProvisionedCustomer, type TestUser } from "../testing/harness";

describe("ask conversations API", () => {
  let h: Harness;
  let sm: TestUser;
  let acme: ProvisionedCustomer;
  let base: string;

  beforeEach(async () => {
    h = await createHarness();
    sm = await h.user("sm@example.com", "success_manager");
    acme = await provisionCustomer(h, sm, "Acme", "owner@acme.test");
    base = `/api/v1/workspaces/${acme.workspaceId}/ask/conversations`;
  });

  afterEach(() => h.close());

  async function enableAsk(): Promise<void> {
    await h.testDb.pg.query("update feature_flags set is_enabled = true where key = 'ask_marketing'");
  }

  it("requires ask:use and the ask_marketing flag", async () => {
    expect((await h.call(base, { token: acme.admin.token })).status).toBe(403);
    await enableAsk();
    expect((await h.call(base, { token: sm.token })).status).toBe(403);
    expect((await h.call(base)).status).toBe(401);
    const created = await h.call<{ id: string; title: string }>(base, {
      method: "POST",
      token: acme.admin.token,
      body: { title: "Spend" },
    });
    expect(created.status).toBe(201);
    expect(created.body.data.title).toBe("Spend");
  });

  it("pages conversations", async () => {
    await enableAsk();
    for (const title of ["One", "Two", "Three"]) {
      expect(
        (await h.call(base, { method: "POST", token: acme.admin.token, body: { title } })).status,
      ).toBe(201);
    }
    const page = await h.call<{ title: string }[]>(`${base}?page=1&limit=2`, { token: acme.admin.token });
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(2);
    expect(page.body.meta).toMatchObject({ total: 3, page: 1, limit: 2 });
    const next = await h.call<{ title: string }[]>(`${base}?page=2&limit=2`, { token: acme.admin.token });
    expect(next.body.data).toHaveLength(1);
  });

  it("returns 404 for another user's thread", async () => {
    await enableAsk();
    const created = await h.call<{ id: string }>(base, {
      method: "POST",
      token: acme.admin.token,
      body: { title: "Private" },
    });
    const peer = await h.user("peer@acme.test");
    await h.testDb.db.insert(tenantMemberships).values({
      tenantId: acme.tenantId,
      userId: peer.id,
      role: "customer_user",
    });
    const path = `${base}/${created.body.data.id}`;
    expect((await h.call(path, { token: peer.token })).status).toBe(404);
    expect((await h.call(path, { method: "DELETE", token: peer.token })).status).toBe(404);
    const own = await h.call<{ title: string; messages: [] }>(path, { token: acme.admin.token });
    expect(own.status).toBe(200);
    expect(own.body.data.title).toBe("Private");
    const removed = await h.call(path, { method: "DELETE", token: acme.admin.token });
    expect(removed.status).toBe(200);
    expect((await h.call(path, { token: acme.admin.token })).status).toBe(404);
  });
});
