import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConflictError, ValidationError, type Role } from "@marketing-os/core";
import { policyDefinitionSchema, type PolicyAutonomy, type PolicyDefinition } from "@marketing-os/policy";
import { reserveAction, type ActionReserve } from "./action-intents";
import { withContext } from "./context";
import { actionIntents, approvals, tenants, workspaces } from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
const tenantA = crypto.randomUUID();
const tenantB = crypto.randomUUID();
const workspaceA = crypto.randomUUID();
const workspaceB = crypto.randomUUID();
let userA = "";

const params = { title: "Weekly review", team: "marketing" };
const now = new Date("2026-11-25T09:00:00.000Z");
const allowedRoles: Role[] = ["customer_admin", "ai_specialist"];
const linearPolicy: PolicyDefinition = {
  name: "linear-create-issue",
  version: "1.0.0",
  connector: "linear",
  action: "create_issue",
  riskClass: "medium",
  requireApproval: true,
  allowedRoles,
  expiresInHours: 72,
};

function gated(overrides: Partial<ActionReserve> = {}): ActionReserve {
  return {
    tenantId: tenantA,
    workspaceId: workspaceA,
    connector: "linear",
    tool: "create_issue",
    params,
    idempotencyKey: "issue-weekly-review",
    policies: [linearPolicy],
    autonomy: "approval_required" satisfies PolicyAutonomy,
    requesterId: userA,
    evidence: "mock.spend is 2550.",
    expectedImpact: "One tracked task.",
    now,
    ...overrides,
  };
}

beforeAll(async () => {
  t = await createTestDatabase();
  userA = await t.createUser("intent-a@example.com");
  await withContext(t.db, { tenantId: tenantA, userId: userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantA, slug: "intent-a", name: "Intent A" });
    await tx.insert(workspaces).values({
      id: workspaceA,
      tenantId: tenantA,
      slug: "default",
      name: "Default",
    });
  });
  await withContext(t.db, { tenantId: tenantB, userId: userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantB, slug: "intent-b", name: "Intent B" });
    await tx.insert(workspaces).values({
      id: workspaceB,
      tenantId: tenantB,
      slug: "default",
      name: "Default",
    });
  });
}, 60_000);

afterAll(async () => {
  await t.close();
});

describe("action intents", () => {
  it("reserves one row for one idempotency key", async () => {
    const first = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      reserveAction(tx, gated()),
    );
    const second = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      reserveAction(
        tx,
        gated({ params: { team: "marketing", title: "Weekly review" } }),
      ),
    );

    expect(second.id).toBe(first.id);
    expect(second.paramsHash).toBe(first.paramsHash);
    expect(first.paramsHash).toMatch(/^[a-f0-9]{64}$/);

    const rows = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(actionIntents),
    );
    expect(rows).toHaveLength(1);
    const approvalRows = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(approvals),
    );
    expect(approvalRows).toHaveLength(1);

    const forB = await withContext(t.db, { tenantId: tenantB, userId: userA, staff: false }, (tx) =>
      tx.select().from(actionIntents),
    );
    expect(forB).toEqual([]);
  });

  it("rejects a missing key before insert", async () => {
    const before = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(actionIntents),
    );

    await expect(
      withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
        reserveAction(tx, gated({ idempotencyKey: "   " })),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const after = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(actionIntents),
    );
    expect(after).toHaveLength(before.length);
  });

  it("does not insert a second row when the same key has different params", async () => {
    await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      reserveAction(tx, gated({ params: { title: "First" }, idempotencyKey: "issue-once" })),
    );

    await expect(
      withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
        reserveAction(tx, gated({ params: { title: "Second" }, idempotencyKey: "issue-once" })),
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    const rows = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(actionIntents),
    );
    expect(rows.filter((row) => row.idempotencyKey === "issue-once")).toHaveLength(1);
  });

  it("stores the hash and not the params", async () => {
    type Row = typeof actionIntents.$inferSelect;
    type ParamsKey = Extract<keyof Row, "params" | "prompt" | "promptBody">;
    const absent: ParamsKey extends never ? true : false = true;
    expect(absent).toBe(true);

    const columns = await t.pg.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'action_intents'
         and column_name in ('params', 'prompt', 'prompt_body')`,
    );
    expect(columns.rows).toEqual([]);
  });

  it("rejects an update of a reserved intent", async () => {
    const reserved = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      reserveAction(tx, gated({ params: { title: "Locked" }, idempotencyKey: "issue-locked" })),
    );
    await expect(
      t.pg.query(`update public.action_intents set tool = 'create_comment' where id = $1`, [reserved.id]),
    ).rejects.toThrow(/immutable/);
  });

  it("writes nothing when the policy denies the write", async () => {
    const beforeIntents = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(actionIntents),
    );
    const beforeApprovals = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(approvals),
    );

    await expect(
      withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
        reserveAction(tx, gated({ autonomy: "observe", idempotencyKey: "issue-denied" })),
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    const afterIntents = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(actionIntents),
    );
    const afterApprovals = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(approvals),
    );
    expect(afterIntents).toHaveLength(beforeIntents.length);
    expect(afterApprovals).toHaveLength(beforeApprovals.length);
  });

  it("reserves one awaiting approval and one pending approval", async () => {
    const reserved = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      reserveAction(tx, gated({ idempotencyKey: "issue-gated" })),
    );
    expect(reserved.status).toBe("awaiting_approval");

    const intentRows = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(actionIntents),
    );
    const intent = intentRows.find((row) => row.id === reserved.id);
    expect(intent?.status).toBe("awaiting_approval");
    expect(intent?.approvalId).toBeTruthy();

    const approvalRows = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(approvals),
    );
    const approval = approvalRows.find((row) => row.id === intent?.approvalId);
    expect(approval?.status).toBe("pending");
    expect(approval?.expiresAt.getTime()).toBe(now.getTime() + 72 * 3_600_000);
    expect(approvalRows.filter((row) => row.id === intent?.approvalId)).toHaveLength(1);
  });

  it("does not reserve when requireApproval is false", async () => {
    const bogus = { ...linearPolicy, requireApproval: false };
    expect(policyDefinitionSchema.safeParse(bogus).success).toBe(false);

    const before = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(actionIntents),
    );
    await expect(
      withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
        reserveAction(
          tx,
          gated({
            idempotencyKey: "issue-unapproved-policy",
            policies: [bogus as PolicyDefinition],
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    const after = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(actionIntents),
    );
    expect(after).toHaveLength(before.length);
  });

  it("rejects marking an unapproved intent executed", async () => {
    const reserved = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      reserveAction(tx, gated({ idempotencyKey: "issue-raw-executed" })),
    );
    await expect(
      t.pg.query(`update public.action_intents set status = 'executed', external_id = 'lin-x' where id = $1`, [
        reserved.id,
      ]),
    ).rejects.toThrow(/approval/);
  });

  it("rejects an intent insert that has no approval", async () => {
    await expect(
      t.pg.query(
        `insert into public.action_intents (
           tenant_id, workspace_id, connector, tool, params_hash, idempotency_key
         ) values ($1, $2, 'linear', 'create_issue', $3, 'raw-without-approval')`,
        [tenantA, workspaceA, "ab".repeat(32)],
      ),
    ).rejects.toThrow(/approval/);
  });
});
