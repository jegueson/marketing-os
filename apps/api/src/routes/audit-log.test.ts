import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditEvents, staffAssignments, withContext } from "@marketing-os/db";
import { createHarness, provisionCustomer, type Harness, type ProvisionedCustomer, type TestUser } from "../testing/harness";

describe("console audit log", () => {
  let h: Harness;
  let sm: TestUser;
  let specialist: TestUser;
  let acme: ProvisionedCustomer;
  let auditPath: string;

  beforeEach(async () => {
    h = await createHarness();
    sm = await h.user("sm-audit@example.com", "success_manager");
    specialist = await h.user("specialist-audit@example.com", "ai_specialist");
    acme = await provisionCustomer(h, sm, "Acme Audit", "owner-audit@acme.test");
    await h.testDb.db.insert(staffAssignments).values({
      tenantId: acme.tenantId,
      userId: specialist.id,
      role: "ai_specialist",
    });
    auditPath = `/api/v1/console/customers/${acme.tenantId}/audit`;
    await withContext(h.testDb.db, { tenantId: acme.tenantId, userId: specialist.id, staff: false }, (tx) =>
      tx.insert(auditEvents).values([
        {
          tenantId: acme.tenantId,
          workspaceId: acme.workspaceId,
          actorId: acme.admin.id,
          actorRole: "customer_admin",
          eventType: "approval.decided",
          resourceType: "approval",
          resourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          payload: { status: "approved", prompt: "SECRET-PROMPT-BODY" },
        },
        {
          tenantId: acme.tenantId,
          workspaceId: acme.workspaceId,
          actorId: specialist.id,
          actorRole: "ai_specialist",
          eventType: "action.executed",
          resourceType: "action_intent",
          resourceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          payload: { externalId: "lin-1" },
        },
      ]),
    );
  });

  afterEach(() => h.close());

  it("returns 403 when the role lacks audit:read", async () => {
    const hidden = await h.call(auditPath, { token: acme.admin.token });
    expect(hidden.status).toBe(403);
  });

  it("returns the fixture decision and the execution for a specialist", async () => {
    const listed = await h.call<{ eventType: string; payload: Record<string, unknown> }[]>(auditPath, {
      token: specialist.token,
    });
    expect(listed.status).toBe(200);
    const decided = listed.body.data.find((row) => row.eventType === "approval.decided");
    const executed = listed.body.data.find((row) => row.eventType === "action.executed");
    expect(decided?.payload).toEqual({ status: "approved" });
    expect(executed?.payload).toEqual({ externalId: "lin-1" });
    expect(JSON.stringify(listed.body.data)).not.toContain("SECRET-PROMPT-BODY");
  });
});
