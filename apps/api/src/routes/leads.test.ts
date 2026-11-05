import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHarness, type Harness, type TestUser } from "../testing/harness";

describe("staff lead management", () => {
  let h: Harness;
  let sm: TestUser;
  let leadId: string;

  beforeEach(async () => {
    h = await createHarness();
    sm = await h.user("sm@example.com", "success_manager");
    const created = await h.call<{ id: string }>("/api/v1/public/leads", {
      method: "POST",
      body: { companyName: "Acme Corp", contactName: "Ada", email: "ada@acme.test", intent: "cloud_workspace" },
    });
    leadId = created.body.data.id;
  });
  afterEach(() => h.close());

  const move = (status: string, token = sm.token) =>
    h.call(`/api/v1/leads/${leadId}/status`, { method: "PATCH", body: { status }, token });

  it("forbids non-staff users", async () => {
    const customer = await h.user("customer@example.com");
    expect((await h.call("/api/v1/leads", { token: customer.token })).status).toBe(403);
  });

  it("lists with pagination, status filter and search", async () => {
    await h.call("/api/v1/public/leads", {
      method: "POST",
      body: { companyName: "Globex", contactName: "Hank", email: "hank@globex.test" },
    });
    const all = await h.call<unknown[]>("/api/v1/leads?limit=1", { token: sm.token });
    expect(all.body.data).toHaveLength(1);
    expect(all.body.meta).toMatchObject({ total: 2, page: 1, limit: 1 });
    const search = await h.call<{ companyName: string }[]>("/api/v1/leads?q=glob", { token: sm.token });
    expect(search.body.data.map((l) => l.companyName)).toEqual(["Globex"]);
    const filtered = await h.call<unknown[]>("/api/v1/leads?status=qualified", { token: sm.token });
    expect(filtered.body.data).toEqual([]);
  });

  it("enforces the state machine and records history", async () => {
    expect((await move("qualified")).status).toBe(409);
    expect((await move("contacted")).status).toBe(200);
    expect((await move("converted")).status).toBe(409);
    const detail = await h.call<{ statusHistory: { payload: { from: string; to: string } }[] }>(
      `/api/v1/leads/${leadId}`,
      { token: sm.token },
    );
    expect(detail.body.data.statusHistory.map((e) => e.payload)).toEqual([{ from: "new", to: "contacted" }]);
  });

  it("appends notes and upserts the discovery record", async () => {
    expect(
      (await h.call(`/api/v1/leads/${leadId}/notes`, { method: "POST", body: { body: "Called" }, token: sm.token })).status,
    ).toBe(201);
    for (const title of ["Pilot", "Pilot v2"]) {
      const res = await h.call(`/api/v1/leads/${leadId}/opportunity`, {
        method: "PUT",
        body: { title, businessProblems: "Low ROAS", recommendedIntegrations: ["mock"] },
        token: sm.token,
      });
      expect(res.status).toBe(200);
    }
    const detail = await h.call<{ notes: unknown[]; opportunity: { title: string } }>(`/api/v1/leads/${leadId}`, {
      token: sm.token,
    });
    expect(detail.body.data.notes).toHaveLength(1);
    expect(detail.body.data.opportunity.title).toBe("Pilot v2");
  });

  it("refuses to convert an unqualified lead", async () => {
    const res = await h.call(`/api/v1/leads/${leadId}/convert`, { method: "POST", token: sm.token });
    expect(res.status).toBe(409);
  });

  it("requires tenants:provision to convert", async () => {
    const specialist = await h.user("ai@example.com", "ai_specialist");
    for (const status of ["contacted", "discovery", "qualified"]) await move(status);
    const res = await h.call(`/api/v1/leads/${leadId}/convert`, { method: "POST", token: specialist.token });
    expect(res.status).toBe(403);
  });

  it("provisions tenant, workspace, onboarding and invite in one step, once", async () => {
    for (const status of ["contacted", "discovery", "qualified"]) await move(status);
    const res = await h.call<{
      tenant: { id: string; name: string };
      workspace: { id: string };
      invitation: { email: string; emailDelivery: string };
    }>(`/api/v1/leads/${leadId}/convert`, { method: "POST", token: sm.token });
    expect(res.status).toBe(201);
    expect(res.body.data.tenant.name).toBe("Acme Corp");
    expect(res.body.data.invitation).toMatchObject({ email: "ada@acme.test", emailDelivery: "sent" });
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);

    const tenantId = res.body.data.tenant.id;
    const { rows } = await h.testDb.pg.query<Record<string, number | string>>(
      `select
        (select count(*)::int from workspaces where tenant_id = $1) workspaces,
        (select count(*)::int from staff_assignments where tenant_id = $1 and user_id = $2) assignments,
        (select count(*)::int from onboarding_checklist_items where tenant_id = $1) items,
        (select count(*)::int from invitations where tenant_id = $1 and status = 'pending') invites,
        (select count(*)::int from outbox_events where tenant_id = $1 and event_type = 'customer.provisioned') events,
        (select status from leads where id = $3) lead_status`,
      [tenantId, sm.id, leadId],
    );
    expect(rows[0]).toMatchObject({ workspaces: 1, assignments: 1, invites: 1, events: 1, lead_status: "converted" });
    expect(Number(rows[0]?.["items"])).toBeGreaterThan(0);
    expect(h.emails.sent.at(-1)?.text).toMatch(/http:\/\/127\.0\.0\.1:3000\/invite\/[a-f0-9]{64}/);

    const again = await h.call(`/api/v1/leads/${leadId}/convert`, { method: "POST", token: sm.token });
    expect(again.status).toBe(409);
  });

  it("keeps the tenant when the invite email fails, and reports it", async () => {
    const failing = await createHarness({
      emailSender: () => ({
        send: async () => {
          throw new Error("smtp down");
        },
      }),
    });
    const staff = await failing.user("sm2@example.com", "success_manager");
    const created = await failing.call<{ id: string }>("/api/v1/public/leads", {
      method: "POST",
      body: { companyName: "Initech", contactName: "Bill", email: "bill@initech.test" },
    });
    const id = created.body.data.id;
    for (const status of ["contacted", "discovery", "qualified"]) {
      await failing.call(`/api/v1/leads/${id}/status`, { method: "PATCH", body: { status }, token: staff.token });
    }
    const res = await failing.call<{ invitation: { emailDelivery: string } }>(`/api/v1/leads/${id}/convert`, {
      method: "POST",
      token: staff.token,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.invitation.emailDelivery).toBe("failed");
    await failing.close();
  });
});
