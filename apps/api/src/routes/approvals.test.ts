import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { approvals, insertApproval, staffAssignments, withContext } from "@marketing-os/db";
import { createHarness, provisionCustomer, type Harness, type ProvisionedCustomer, type TestUser } from "../testing/harness";

describe("approvals API", () => {
  let h: Harness;
  let sm: TestUser;
  let specialist: TestUser;
  let acme: ProvisionedCustomer;
  let listPath: string;

  beforeEach(async () => {
    h = await createHarness();
    sm = await h.user("sm-approvals@example.com", "success_manager");
    specialist = await h.user("specialist-approvals@example.com", "ai_specialist");
    acme = await provisionCustomer(h, sm, "Acme Approvals", "owner-approvals@acme.test");
    await h.testDb.db.insert(staffAssignments).values({
      tenantId: acme.tenantId,
      userId: specialist.id,
      role: "ai_specialist",
    });
    listPath = `/api/v1/workspaces/${acme.workspaceId}/approvals`;
  });

  afterEach(() => h.close());

  async function enableFlag(): Promise<void> {
    await h.testDb.pg.query("update feature_flags set is_enabled = true where key = 'managed_work'");
  }

  async function seedApproval(expiresAt: Date): Promise<string> {
    const stored = await withContext(
      h.testDb.db,
      { tenantId: acme.tenantId, userId: acme.admin.id, staff: false },
      (tx) =>
        insertApproval(tx, {
          tenantId: acme.tenantId,
          workspaceId: acme.workspaceId,
          requesterId: acme.admin.id,
          action: "linear.create_issue",
          riskLevel: "medium",
          evidence: "mock.spend is 2550.",
          expectedImpact: "One tracked task.",
          expiresAt,
        }),
    );
    return stored.id;
  }

  it("returns 403 when the caller cannot decide", async () => {
    await enableFlag();
    const denied = await h.call(listPath, { token: specialist.token });
    expect(denied.status).toBe(403);
  });

  it("returns 404 while managed_work is off", async () => {
    const hidden = await h.call(listPath, { token: acme.admin.token });
    expect(hidden.status).toBe(404);
    expect(hidden.body.error?.message).toBe("Not found");
  });

  it("returns 404 for another tenant", async () => {
    await enableFlag();
    const other = await provisionCustomer(h, sm, "Other Approvals", "owner-approvals@other.test");
    const cross = await h.call(listPath, { token: other.admin.token });
    expect(cross.status).toBe(404);
    expect(cross.body.error?.message).toBe("Not found");
  });

  it("leaves an expired approval unchanged", async () => {
    await enableFlag();
    const id = await seedApproval(new Date(Date.now() - 60_000));
    const decided = await h.call(`${listPath}/${id}/decision`, {
      method: "POST",
      token: acme.admin.token,
      body: { decision: "approved", comment: "Ship it." },
    });
    expect(decided.status).toBe(409);

    const [row] = await withContext(
      h.testDb.db,
      { tenantId: acme.tenantId, userId: acme.admin.id, staff: false },
      (tx) => tx.select().from(approvals).where(and(eq(approvals.id, id), eq(approvals.workspaceId, acme.workspaceId))),
    );
    expect(row?.status).toBe("expired");
    expect(row?.reviewerId).toBeNull();
    expect(row?.comment).toBeNull();
  });

  it("stores a rejection and ignores a second decision", async () => {
    await enableFlag();
    const id = await seedApproval(new Date(Date.now() + 3_600_000));
    const rejected = await h.call<{ status: string; comment: string | null }>(`${listPath}/${id}/decision`, {
      method: "POST",
      token: acme.admin.token,
      body: { decision: "rejected", comment: "Not this week." },
    });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe("rejected");
    expect(rejected.body.data.comment).toBe("Not this week.");

    const again = await h.call(`${listPath}/${id}/decision`, {
      method: "POST",
      token: acme.admin.token,
      body: { decision: "approved", comment: "Changed my mind." },
    });
    expect(again.status).toBe(409);

    const [row] = await withContext(
      h.testDb.db,
      { tenantId: acme.tenantId, userId: acme.admin.id, staff: false },
      (tx) => tx.select().from(approvals).where(eq(approvals.id, id)),
    );
    expect(row?.status).toBe("rejected");
    expect(row?.comment).toBe("Not this week.");
  });
});
