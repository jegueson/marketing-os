import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ConflictError, type Role } from "@marketing-os/core";
import { LinearConnector } from "@marketing-os/connector-linear";
import type { PolicyAutonomy, PolicyDefinition } from "@marketing-os/policy";
import {
  auditEvents,
  decideApproval,
  expireApprovals,
  reserveAction,
  withContext,
  type ActionReserve,
} from "@marketing-os/db";
import { approvals, tenants, workspaces } from "@marketing-os/db/schema";
import { createTestDatabase, type TestDatabase } from "@marketing-os/db/testing";
import { eq } from "drizzle-orm";
import { executeApprovedAction } from "./execute-approved";

let t: TestDatabase;
const tenantA = crypto.randomUUID();
const workspaceA = crypto.randomUUID();
let userA = "";
const token = "linear-sandbox-token";
const allowedRoles: Role[] = ["customer_admin", "ai_specialist"];
const policy: PolicyDefinition = {
  name: "linear-create-issue",
  version: "1.0.0",
  connector: "linear",
  action: "create_issue",
  riskClass: "medium",
  requireApproval: true,
  allowedRoles,
  expiresInHours: 72,
};
const params = {
  title: "Weekly review",
  teamId: "9cfb482a-81e3-4154-b5b9-2c805e70a02d",
  description: "Spend rose without a lead change.",
};

function reserve(idempotencyKey: string, now: Date): ActionReserve {
  return {
    tenantId: tenantA,
    workspaceId: workspaceA,
    connector: "linear",
    tool: "create_issue",
    params,
    idempotencyKey,
    policies: [policy],
    autonomy: "approval_required" satisfies PolicyAutonomy,
    requesterId: userA,
    evidence: "mock.spend is 2550.",
    expectedImpact: "One tracked task.",
    now,
  };
}

function fakeClient(): { client: LinearConnector; calls: () => number } {
  const fetchImpl = vi.fn(async () =>
    Response.json({
      data: { issueCreate: { success: true, issue: { id: "lin-1", title: params.title } } },
    }),
  );
  return {
    client: new LinearConnector({ fetch: fetchImpl as unknown as typeof fetch }),
    calls: () => fetchImpl.mock.calls.length,
  };
}

beforeAll(async () => {
  t = await createTestDatabase();
  userA = await t.createUser("execute-a@example.com");
  await withContext(t.db, { tenantId: tenantA, userId: userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantA, slug: "execute-a", name: "Execute A" });
    await tx.insert(workspaces).values({
      id: workspaceA,
      tenantId: tenantA,
      slug: "default",
      name: "Default",
    });
  });
}, 60_000);

afterAll(async () => {
  await t.close();
});

describe("execute approved action", () => {
  beforeAll(() => {
    vi.stubGlobal("fetch", () => {
      throw new Error("test dialed the network");
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  async function run(key: string, now: Date, client: LinearConnector) {
    return executeApprovedAction(t.db, {
      tenantId: tenantA,
      workspaceId: workspaceA,
      userId: userA,
      actorRole: "customer_admin",
      connector: "linear",
      tool: "create_issue",
      params,
      idempotencyKey: key,
      accessToken: token,
      now,
      client,
    });
  }

  it("performs zero calls for every non-approved status", async () => {
    const { client, calls } = fakeClient();
    const pendingNow = new Date("2026-11-25T09:00:00.000Z");
    await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      reserveAction(tx, reserve("issue-pending", pendingNow)),
    );
    await expect(run("issue-pending", pendingNow, client)).rejects.toBeInstanceOf(ConflictError);

    const rejected = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      reserveAction(tx, reserve("issue-rejected", pendingNow)),
    );
    await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      decideApproval(tx, {
        approvalId: rejected.approvalId,
        reviewerId: userA,
        decision: "rejected",
        comment: "Not this week.",
        now: pendingNow,
      }),
    );
    await expect(run("issue-rejected", pendingNow, client)).rejects.toBeInstanceOf(ConflictError);

    const expiredAt = new Date(Date.now() - 73 * 3_600_000);
    await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, async (tx) => {
      await reserveAction(tx, reserve("issue-expired", expiredAt));
      await expireApprovals(tx, new Date());
    });
    await expect(run("issue-expired", new Date(), client)).rejects.toBeInstanceOf(ConflictError);

    const cancelled = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      reserveAction(tx, reserve("issue-cancelled", pendingNow)),
    );
    await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx
        .update(approvals)
        .set({
          status: "cancelled",
          reviewerId: userA,
          comment: "Stop.",
          decidedAt: pendingNow,
          updatedAt: pendingNow,
        })
        .where(eq(approvals.id, cancelled.approvalId)),
    );
    await expect(run("issue-cancelled", pendingNow, client)).rejects.toBeInstanceOf(ConflictError);

    const late = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      reserveAction(tx, reserve("issue-late", pendingNow)),
    );
    await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      decideApproval(tx, {
        approvalId: late.approvalId,
        reviewerId: userA,
        decision: "approved",
        comment: "Ship it.",
        now: pendingNow,
      }),
    );
    await expect(run("issue-late", new Date(pendingNow.getTime() + 73 * 3_600_000), client)).rejects.toBeInstanceOf(
      ConflictError,
    );

    expect(calls()).toBe(0);
  });

  it("records a failed call once and does not call again", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ data: { issueCreate: { success: false } } }));
    const client = new LinearConnector({ fetch: fetchImpl as unknown as typeof fetch });
    const now = new Date("2026-11-25T09:00:00.000Z");
    const reserved = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      reserveAction(tx, reserve("issue-failed", now)),
    );
    await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      decideApproval(tx, {
        approvalId: reserved.approvalId,
        reviewerId: userA,
        decision: "approved",
        comment: "Ship it.",
        now,
      }),
    );

    await expect(run("issue-failed", now, client)).rejects.toThrow(/issueCreate failed/);
    expect(fetchImpl.mock.calls.length).toBe(1);
    await expect(run("issue-failed", now, client)).rejects.toBeInstanceOf(ConflictError);
    expect(fetchImpl.mock.calls.length).toBe(1);

    const audits = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(auditEvents).where(eq(auditEvents.eventType, "action.failed")),
    );
    const payload = JSON.stringify(audits.map((row) => row.payload));
    expect(payload).not.toContain(token);
    expect(payload).not.toContain("prompt");
  });

  it("calls Linear once and a second reserve does not call again", async () => {
    const { client, calls } = fakeClient();
    const now = new Date("2026-11-25T09:00:00.000Z");
    const reserved = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      reserveAction(tx, reserve("issue-once", now)),
    );
    await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      decideApproval(tx, {
        approvalId: reserved.approvalId,
        reviewerId: userA,
        decision: "approved",
        comment: "Ship it.",
        now,
      }),
    );

    const executed = await run("issue-once", now, client);
    expect(executed.externalId).toBe("lin-1");
    expect(calls()).toBe(1);

    const again = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      reserveAction(tx, reserve("issue-once", now)),
    );
    expect(again.externalId).toBe("lin-1");
    const replay = await run("issue-once", now, client);
    expect(replay.externalId).toBe("lin-1");
    expect(calls()).toBe(1);

    const audits = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(auditEvents).where(eq(auditEvents.eventType, "action.executed")),
    );
    const payload = JSON.stringify(audits.map((row) => row.payload));
    expect(payload).toContain("lin-1");
    expect(payload).not.toContain(token);
    expect(payload).not.toContain("prompt");
  });
});
