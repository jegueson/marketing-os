import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHarness, provisionCustomer, type Harness, type ProvisionedCustomer, type TestUser } from "../testing/harness";

describe("specialist console", () => {
  let h: Harness;
  let sm: TestUser;
  let otherSm: TestUser;
  let acme: ProvisionedCustomer;
  let globex: ProvisionedCustomer;

  beforeEach(async () => {
    h = await createHarness();
    sm = await h.user("sm@example.com", "success_manager");
    otherSm = await h.user("sm2@example.com", "success_manager");
    acme = await provisionCustomer(h, sm, "Acme", "owner@acme.test");
    globex = await provisionCustomer(h, otherSm, "Globex", "owner@globex.test");
  });
  afterEach(() => h.close());

  it("lists only assigned customers, all for a platform admin", async () => {
    const mine = await h.call<{ id: string }[]>("/api/v1/console/customers", { token: sm.token });
    expect(mine.body.data.map((t) => t.id)).toEqual([acme.tenantId]);
    const admin = await h.user("admin@example.com", "platform_admin");
    const all = await h.call<{ id: string }[]>("/api/v1/console/customers", { token: admin.token });
    expect(all.body.data.map((t) => t.id).sort()).toEqual([acme.tenantId, globex.tenantId].sort());
  });

  it("denies customers and unassigned staff", async () => {
    expect((await h.call("/api/v1/console/customers", { token: acme.admin.token })).status).toBe(403);
    expect((await h.call(`/api/v1/console/customers/${globex.tenantId}`, { token: sm.token })).status).toBe(403);
  });

  it("shows the customer overview with discovery, onboarding and invites", async () => {
    const res = await h.call<{
      tenant: { name: string };
      lead: { email: string };
      onboarding: { items: unknown[] }[];
      invitations: { status: string }[];
    }>(`/api/v1/console/customers/${acme.tenantId}`, { token: sm.token });
    expect(res.status).toBe(200);
    expect(res.body.data.tenant.name).toBe("Acme");
    expect(res.body.data.lead.email).toBe("owner@acme.test");
    expect(res.body.data.onboarding[0]?.items.length).toBeGreaterThan(0);
    expect(res.body.data.invitations.map((i) => i.status)).toEqual(["accepted"]);
  });

  it("returns the tenant audit trail, read only", async () => {
    const res = await h.call<{ eventType: string }[]>(`/api/v1/console/customers/${acme.tenantId}/audit`, {
      token: sm.token,
    });
    expect(res.body.data.map((e) => e.eventType)).toEqual(
      expect.arrayContaining(["customer.provisioned", "invitation.accepted"]),
    );
    expect(res.body.data.some((e) => e.eventType === "lead.created")).toBe(false);
  });
});
