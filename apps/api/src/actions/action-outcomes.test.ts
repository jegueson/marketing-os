import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@marketing-os/core";
import { LinearConnector } from "@marketing-os/connector-linear";
import type { PolicyAutonomy, PolicyDefinition } from "@marketing-os/policy";
import {
  actionOutcomes,
  decideApproval,
  readActionOutcome,
  reserveAction,
  withContext,
  type ActionReserve,
} from "@marketing-os/db";
import { tenants, workspaces } from "@marketing-os/db/schema";
import { createTestDatabase, type TestDatabase } from "@marketing-os/db/testing";
import { eq } from "drizzle-orm";
import { executeApprovedAction } from "./execute-approved";

let t: TestDatabase;
const tenantA = crypto.randomUUID();
const workspaceA = crypto.randomUUID();
let userA = "";
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
const now = new Date("2026-11-25T09:00:00.000Z");

function reserve(idempotencyKey: string): ActionReserve {
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

beforeAll(async () => {
  t = await createTestDatabase();
  userA = await t.createUser("outcome-a@example.com");
  await withContext(t.db, { tenantId: tenantA, userId: userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantA, slug: "outcome-a", name: "Outcome A" });
    await tx.insert(workspaces).values({
      id: workspaceA,
      tenantId: tenantA,
      slug: "default",
      name: "Default",
    });
  });
  vi.stubGlobal("fetch", () => {
    throw new Error("test dialed the network");
  });
}, 60_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await t.close();
});

async function approve(key: string): Promise<string> {
  const reserved = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
    reserveAction(tx, reserve(key)),
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
  return reserved.id;
}

function client(success: boolean): LinearConnector {
  const fetchImpl = vi.fn(async () =>
    Response.json({
      data: { issueCreate: { success, issue: { id: "lin-1", title: params.title } } },
    }),
  );
  return new LinearConnector({ fetch: fetchImpl as unknown as typeof fetch });
}

describe("action outcomes", () => {
  it("stores one outcome for one success and none for a second reserve", async () => {
    await approve("issue-outcome");
    const executed = await executeApprovedAction(t.db, {
      tenantId: tenantA,
      workspaceId: workspaceA,
      userId: userA,
      actorRole: "customer_admin",
      connector: "linear",
      tool: "create_issue",
      params,
      idempotencyKey: "issue-outcome",
      accessToken: "linear-sandbox-token",
      now,
      client: client(true),
    });

    const outcome = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      readActionOutcome(tx, executed.intentId),
    );
    expect(outcome).toEqual({
      actionId: executed.intentId,
      externalId: "lin-1",
      recordedAt: now,
    });

    await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      reserveAction(tx, reserve("issue-outcome")),
    );
    await executeApprovedAction(t.db, {
      tenantId: tenantA,
      workspaceId: workspaceA,
      userId: userA,
      actorRole: "customer_admin",
      connector: "linear",
      tool: "create_issue",
      params,
      idempotencyKey: "issue-outcome",
      accessToken: "linear-sandbox-token",
      now,
      client: client(true),
    });

    const rows = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(actionOutcomes).where(eq(actionOutcomes.actionId, executed.intentId)),
    );
    expect(rows).toHaveLength(1);
  });

  it("stores no outcome when the call fails", async () => {
    const actionId = await approve("issue-outcome-failed");
    await expect(
      executeApprovedAction(t.db, {
        tenantId: tenantA,
        workspaceId: workspaceA,
        userId: userA,
        actorRole: "customer_admin",
        connector: "linear",
        tool: "create_issue",
        params,
        idempotencyKey: "issue-outcome-failed",
        accessToken: "linear-sandbox-token",
        now,
        client: client(false),
      }),
    ).rejects.toThrow(/issueCreate failed/);

    const outcome = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      readActionOutcome(tx, actionId),
    );
    expect(outcome).toBeNull();
  });
});
