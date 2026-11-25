/**
 * Sprint 5 exit journey: publish Linear policy, create recommendation,
 * reserve approval, cross-tenant 404, approve, fake Linear issue id, outcome
 * row, replay, flag-off 404, no token in audit. Checklist: docs/security/s5-review.md.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LinearConnector } from "../../connectors/linear/src/index";
import type { PolicyAutonomy, PolicyDefinition } from "../../packages/policy/src/index";
import {
  insertRecommendation,
  readActionOutcome,
  reserveAction,
  withContext,
} from "../../packages/db/src/index";
import { staffAssignments } from "../../packages/db/src/schema/index";
import { executeApprovedAction } from "../../apps/api/src/actions/execute-approved";
import {
  createHarness,
  provisionCustomer,
  type Harness,
} from "../../apps/api/src/testing/harness";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const TOKEN = "linear-sandbox-token";
const now = new Date("2026-11-25T09:00:00.000Z");
const params = {
  title: "Weekly review",
  teamId: "9cfb482a-81e3-4154-b5b9-2c805e70a02d",
  description: "Spend rose without a lead change.",
};
const fixture = {
  problem: "Spend rose without a lead change.",
  evidence: "mock.spend is 2550. Previous period is 2100. Lead count is unchanged.",
  proposedAction: "Create a Linear issue for the weekly review.",
  expectedImpact: "The specialist gets one tracked task.",
  confidence: "medium" as const,
  effort: "low" as const,
};

const policySource = readFileSync(
  join(repoRoot, "customer-configs/examples/linear-create-issue/policy.yaml"),
  "utf8",
);
/** Matches customer-configs/examples/linear-create-issue/policy.yaml. */
const policy: PolicyDefinition = {
  name: "linear-create-issue",
  version: "1.0.0",
  connector: "linear",
  action: "create_issue",
  riskClass: "medium",
  requireApproval: true,
  allowedRoles: ["customer_admin", "ai_specialist"],
  expiresInHours: 72,
};

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

async function runJourney(mode: "self_hosted" | "cloud"): Promise<void> {
  let h: Harness | undefined;
  vi.stubGlobal("fetch", () => {
    throw new Error("test dialed the network");
  });
  try {
    h = await createHarness({}, mode);
    const sm = await h.user(`sm-s5-${mode}@example.com`, "success_manager");
    const specialist = await h.user(`specialist-s5-${mode}@example.com`, "ai_specialist");
    const acme = await provisionCustomer(h, sm, `Acme S5 ${mode}`, `owner-s5-${mode}@acme.test`);
    await h.testDb.db.insert(staffAssignments).values({
      tenantId: acme.tenantId,
      userId: specialist.id,
      role: "ai_specialist",
    });

    const importPath = `/api/v1/workspaces/${acme.workspaceId}/config/import`;
    const approvalsPath = `/api/v1/workspaces/${acme.workspaceId}/approvals`;
    const recommendationsPath = `/api/v1/workspaces/${acme.workspaceId}/recommendations`;
    const cockpitPath = `/api/v1/workspaces/${acme.workspaceId}/cockpit`;

    expect(
      (
        await h.call(importPath, {
          method: "POST",
          token: specialist.token,
          body: { kind: "policy", source: policySource },
        })
      ).status,
    ).toBe(404);

    expect((await h.call(approvalsPath, { token: acme.admin.token })).status).toBe(404);
    expect((await h.call(recommendationsPath, { token: acme.admin.token })).status).toBe(404);
    const cockpitOff = await h.call<{ recommendations: unknown[] }>(cockpitPath, {
      token: acme.admin.token,
    });
    expect(cockpitOff.status).toBe(200);
    expect(cockpitOff.body.data.recommendations).toEqual([]);

    await h.testDb.pg.query(
      "update feature_flags set is_enabled = true where key = 'specialist_config'",
    );
    await h.testDb.pg.query(
      "update feature_flags set is_enabled = true where key = 'managed_work'",
    );

    const published = await h.call<{ kind: string; name: string; version: number }>(importPath, {
      method: "POST",
      token: specialist.token,
      body: { kind: "policy", source: policySource },
    });
    expect(published.status).toBe(200);
    expect(published.body.data).toMatchObject({
      kind: "policy",
      name: "linear-create-issue",
      version: 1,
    });

    await withContext(h.testDb.db, { tenantId: acme.tenantId, userId: acme.admin.id, staff: false }, (tx) =>
      insertRecommendation(tx, {
        tenantId: acme.tenantId,
        workspaceId: acme.workspaceId,
        ...fixture,
      }),
    );
    const listed = await h.call<{ problem: string }[]>(recommendationsPath, {
      token: acme.admin.token,
    });
    expect(listed.status).toBe(200);
    expect(listed.body.data).toEqual([expect.objectContaining({ problem: fixture.problem })]);

    const { client, calls } = fakeClient();
    const reserved = await withContext(
      h.testDb.db,
      { tenantId: acme.tenantId, userId: acme.admin.id, staff: false },
      (tx) =>
        reserveAction(tx, {
          tenantId: acme.tenantId,
          workspaceId: acme.workspaceId,
          connector: "linear",
          tool: "create_issue",
          params,
          idempotencyKey: `s5-${mode}-issue`,
          policies: [policy],
          autonomy: "approval_required" satisfies PolicyAutonomy,
          requesterId: acme.admin.id,
          evidence: fixture.evidence,
          expectedImpact: fixture.expectedImpact,
          now,
        }),
    );
    expect(calls()).toBe(0);
    expect(reserved.status).toBe("awaiting_approval");

    const other = await provisionCustomer(h, sm, `Other S5 ${mode}`, `owner-s5-${mode}@other.test`);
    const crossApprovals = await h.call(approvalsPath, { token: other.admin.token });
    expect(crossApprovals.status).toBe(404);
    expect(crossApprovals.body.error?.message).toBe("Not found");
    const crossRecommendations = await h.call(recommendationsPath, { token: other.admin.token });
    expect(crossRecommendations.status).toBe(404);
    expect(crossRecommendations.body.error?.message).toBe("Not found");

    const pending = await h.call<{ id: string; status: string }[]>(approvalsPath, {
      token: acme.admin.token,
    });
    expect(pending.status).toBe(200);
    expect(pending.body.data.some((row) => row.id === reserved.approvalId && row.status === "pending")).toBe(
      true,
    );

    const decided = await h.call<{ status: string }>(`${approvalsPath}/${reserved.approvalId}/decision`, {
      method: "POST",
      token: acme.admin.token,
      body: { decision: "approved", comment: "Approved for the weekly review." },
    });
    expect(decided.status).toBe(200);
    expect(decided.body.data.status).toBe("approved");
    expect(calls()).toBe(0);

    const executed = await executeApprovedAction(h.testDb.db, {
      tenantId: acme.tenantId,
      workspaceId: acme.workspaceId,
      userId: acme.admin.id,
      actorRole: "customer_admin",
      connector: "linear",
      tool: "create_issue",
      params,
      idempotencyKey: `s5-${mode}-issue`,
      accessToken: TOKEN,
      now,
      client,
    });
    expect(calls()).toBe(1);
    expect(executed.externalId).toBe("lin-1");

    const outcome = await withContext(
      h.testDb.db,
      { tenantId: acme.tenantId, userId: acme.admin.id, staff: false },
      (tx) => readActionOutcome(tx, executed.intentId),
    );
    expect(outcome).toEqual({
      actionId: executed.intentId,
      externalId: "lin-1",
      recordedAt: now,
    });

    const replay = await executeApprovedAction(h.testDb.db, {
      tenantId: acme.tenantId,
      workspaceId: acme.workspaceId,
      userId: acme.admin.id,
      actorRole: "customer_admin",
      connector: "linear",
      tool: "create_issue",
      params,
      idempotencyKey: `s5-${mode}-issue`,
      accessToken: TOKEN,
      now,
      client,
    });
    expect(calls()).toBe(1);
    expect(replay.externalId).toBe("lin-1");

    const { rows: audits } = await h.testDb.pg.query<{ event_type: string; payload: unknown }>(
      "select event_type, payload from audit_events where tenant_id = $1 and event_type in ('action.executed', 'approval.decided', 'config.policy_imported')",
      [acme.tenantId],
    );
    expect(audits.some((row) => row.event_type === "action.executed")).toBe(true);
    expect(audits.some((row) => row.event_type === "approval.decided")).toBe(true);
    expect(audits.some((row) => row.event_type === "config.policy_imported")).toBe(true);
    expect(JSON.stringify(audits)).not.toContain(TOKEN);
    expect(JSON.stringify(audits)).not.toContain("prompt");

    await h.testDb.pg.query(
      "update feature_flags set is_enabled = false where key = 'managed_work'",
    );
    expect((await h.call(approvalsPath, { token: acme.admin.token })).status).toBe(404);
    expect((await h.call(recommendationsPath, { token: acme.admin.token })).status).toBe(404);
    const cockpitAgain = await h.call<{ recommendations: unknown[] }>(cockpitPath, {
      token: acme.admin.token,
    });
    expect(cockpitAgain.status).toBe(200);
    expect(cockpitAgain.body.data.recommendations).toEqual([]);
  } finally {
    vi.unstubAllGlobals();
    h?.close();
  }
}

describe("sprint 5 journey", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes on self_hosted", async () => {
    await runJourney("self_hosted");
  });

  it("passes on cloud", async () => {
    await runJourney("cloud");
  });
});
