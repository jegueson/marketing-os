import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHarness, inviteTokenFrom, type Harness, type TestUser } from "../testing/harness";

describe("invitations", () => {
  let h: Harness;
  let sm: TestUser;
  let tenantId: string;
  let invitationId: string;
  const invitee = "owner@acme.test";

  beforeEach(async () => {
    h = await createHarness();
    sm = await h.user("sm@example.com", "success_manager");
    const lead = await h.call<{ id: string }>("/api/v1/public/leads", {
      method: "POST",
      body: { companyName: "Acme", contactName: "Owner", email: invitee },
    });
    for (const status of ["contacted", "discovery", "qualified"]) {
      await h.call(`/api/v1/leads/${lead.body.data.id}/status`, { method: "PATCH", body: { status }, token: sm.token });
    }
    const converted = await h.call<{ tenant: { id: string }; invitation: { id: string } }>(
      `/api/v1/leads/${lead.body.data.id}/convert`,
      { method: "POST", token: sm.token },
    );
    tenantId = converted.body.data.tenant.id;
    invitationId = converted.body.data.invitation.id;
  });
  afterEach(() => h.close());

  const accept = (token: string, user: TestUser) =>
    h.call<{ tenantId: string; role: string }>("/api/v1/invitations/accept", {
      method: "POST",
      body: { token },
      token: user.token,
    });

  it("creates the membership for the invited email, once", async () => {
    const owner = await h.user(invitee);
    const token = inviteTokenFrom(h.emails, invitee);
    const res = await accept(token, owner);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ tenantId, role: "customer_admin" });
    const me = await h.call<{ memberships: { tenantId: string }[] }>("/api/v1/me", { token: owner.token });
    expect(me.body.data.memberships.map((m) => m.tenantId)).toEqual([tenantId]);
    expect((await accept(token, owner)).status).toBe(409);
  });

  it("rejects a different signed-in email", async () => {
    const other = await h.user("intruder@example.com");
    expect((await accept(inviteTokenFrom(h.emails, invitee), other)).status).toBe(403);
  });

  it("rejects an expired invitation", async () => {
    await h.testDb.pg.query("update invitations set expires_at = now() - interval '1 minute' where id = $1", [invitationId]);
    const owner = await h.user(invitee);
    const res = await accept(inviteTokenFrom(h.emails, invitee), owner);
    expect(res.status).toBe(410);
    expect(res.body.error?.code).toBe("invitation_expired");
  });

  it("rejects an unknown token", async () => {
    const owner = await h.user(invitee);
    expect((await accept("f".repeat(64), owner)).status).toBe(404);
  });

  it("resend rotates the token and revoke blocks acceptance", async () => {
    const oldToken = inviteTokenFrom(h.emails, invitee);
    const resent = await h.call(`/api/v1/console/customers/${tenantId}/invitations/${invitationId}/resend`, {
      method: "POST",
      token: sm.token,
    });
    expect(resent.status).toBe(200);
    const newToken = inviteTokenFrom(h.emails, invitee);
    expect(newToken).not.toBe(oldToken);
    const owner = await h.user(invitee);
    expect((await accept(oldToken, owner)).status).toBe(404);

    const revoked = await h.call(`/api/v1/console/customers/${tenantId}/invitations/${invitationId}/revoke`, {
      method: "POST",
      token: sm.token,
    });
    expect(revoked.status).toBe(200);
    const res = await accept(newToken, owner);
    expect(res.status).toBe(410);
    expect(res.body.error?.code).toBe("invitation_revoked");
  });
});
