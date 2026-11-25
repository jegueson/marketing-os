import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConflictError } from "@marketing-os/core";
import { decideApproval, expireApprovals, insertApproval } from "./approvals";
import { withContext } from "./context";
import { approvals, tenants, workspaces } from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
const tenantA = crypto.randomUUID();
const tenantB = crypto.randomUUID();
const workspaceA = crypto.randomUUID();
let userA = "";

const now = new Date();
const past = new Date(now.getTime() - 60_000);
const future = new Date(now.getTime() + 3_600_000);

beforeAll(async () => {
  t = await createTestDatabase();
  userA = await t.createUser("approval-a@example.com");
  await withContext(t.db, { tenantId: tenantA, userId: userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantA, slug: "appr-a", name: "Appr A" });
    await tx.insert(workspaces).values({
      id: workspaceA,
      tenantId: tenantA,
      slug: "default",
      name: "Default",
    });
  });
  await withContext(t.db, { tenantId: tenantB, userId: userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantB, slug: "appr-b", name: "Appr B" });
    await tx.insert(workspaces).values({
      tenantId: tenantB,
      slug: "default",
      name: "Default",
    });
  });
}, 60_000);

afterAll(async () => {
  await t.close();
});

describe("approval records", () => {
  it("does not approve a pending row past expiry", async () => {
    const created = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      insertApproval(tx, {
        tenantId: tenantA,
        workspaceId: workspaceA,
        requesterId: userA,
        action: "Create a Linear issue",
        riskLevel: "medium",
        evidence: "mock.spend is 2550.",
        expectedImpact: "One tracked task.",
        expiresAt: past,
      }),
    );

    await expect(
      withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
        decideApproval(tx, {
          approvalId: created.id,
          reviewerId: userA,
          decision: "approved",
          comment: "Ship it.",
          now,
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    const beforeExpire = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(approvals),
    );
    expect(beforeExpire.find((item) => item.id === created.id)?.status).toBe("pending");

    await expect(
      t.pg.query(
        `update public.approvals
           set status = 'approved', reviewer_id = $2, comment = 'Ship it.',
               decided_at = now(), updated_at = now()
         where id = $1`,
        [created.id, userA],
      ),
    ).rejects.toThrow(/approval expired/);

    const expired = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      expireApprovals(tx, now),
    );
    expect(expired).toBe(1);

    const rows = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(approvals),
    );
    const row = rows.find((item) => item.id === created.id);
    expect(row?.status).toBe("expired");
    expect(row?.reviewerId).toBeNull();
    expect(row?.comment).toBeNull();

    await expect(
      withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
        decideApproval(tx, {
          approvalId: created.id,
          reviewerId: userA,
          decision: "approved",
          comment: "Ship it.",
          now,
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    const forB = await withContext(t.db, { tenantId: tenantB, userId: userA, staff: false }, (tx) =>
      tx.select().from(approvals),
    );
    expect(forB).toEqual([]);
  });

  it("rejects an insert that is already decided", async () => {
    await expect(
      t.pg.query(
        `insert into public.approvals (
           tenant_id, workspace_id, requester_id, reviewer_id, action, risk_level,
           evidence, expected_impact, status, comment, expires_at, decided_at
         ) values (
           $1, $2, $3, $3, 'Create a Linear issue', 'low', 'evidence text',
           'One task.', 'approved', 'skip', now() + interval '1 hour', now()
         )`,
        [tenantA, workspaceA, userA],
      ),
    ).rejects.toThrow(/inserted as pending/);
  });

  it("stores the comment when the reviewer rejects", async () => {
    const created = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      insertApproval(tx, {
        tenantId: tenantA,
        workspaceId: workspaceA,
        requesterId: userA,
        action: "Create a Linear issue",
        riskLevel: "medium",
        evidence: "mock.spend is 2550.",
        expectedImpact: "One tracked task.",
        expiresAt: future,
      }),
    );

    const decided = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      decideApproval(tx, {
        approvalId: created.id,
        reviewerId: userA,
        decision: "rejected",
        comment: "Not this week.",
        now,
      }),
    );

    expect(decided.status).toBe("rejected");
    expect(decided.comment).toBe("Not this week.");
    expect(decided.reviewerId).toBe(userA);
    expect(decided.decidedAt).toEqual(now);
  });

  it("throws on a second decision and keeps the first", async () => {
    const created = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      insertApproval(tx, {
        tenantId: tenantA,
        workspaceId: workspaceA,
        requesterId: userA,
        action: "Create a Linear issue",
        riskLevel: "low",
        evidence: "The fixture has one open task.",
        expectedImpact: "No duplicate issue.",
        expiresAt: future,
      }),
    );
    await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      decideApproval(tx, {
        approvalId: created.id,
        reviewerId: userA,
        decision: "rejected",
        comment: "Not this week.",
        now,
      }),
    );

    await expect(
      withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
        decideApproval(tx, {
          approvalId: created.id,
          reviewerId: userA,
          decision: "approved",
          comment: "Changed my mind.",
          now,
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    const rows = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(approvals),
    );
    const still = rows.find((item) => item.id === created.id);
    expect(still?.status).toBe("rejected");
    expect(still?.comment).toBe("Not this week.");
  });
});
