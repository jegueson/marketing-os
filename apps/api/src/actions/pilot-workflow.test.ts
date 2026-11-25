import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { LinearConnector } from "@marketing-os/connector-linear";
import type { PolicyAutonomy, PolicyDefinition } from "@marketing-os/policy";
import {
  decideApproval,
  readActionOutcome,
  reserveAction,
  withContext,
  type ActionReserve,
} from "@marketing-os/db";
import { tenants, workspaces } from "@marketing-os/db/schema";
import { createTestDatabase, type TestDatabase } from "@marketing-os/db/testing";
import { workflowDefinitionSchema } from "@marketing-os/schemas";
import { interpretWorkflow, type WorkflowDeps } from "@marketing-os/workflow";
import { parse as parseYaml } from "yaml";
import { executeApprovedAction } from "./execute-approved";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const workflow = workflowDefinitionSchema.parse(
  parseYaml(readFileSync(join(root, "customer-configs/examples/linear-create-issue/workflow.yaml"), "utf8")),
);
const policy = parseYaml(
  readFileSync(join(root, "customer-configs/examples/linear-create-issue/policy.yaml"), "utf8"),
) as PolicyDefinition;
const actionStep = workflow.steps.find((step) => step.kind === "action");
if (actionStep?.kind !== "action") {
  throw new Error("example workflow has no action step");
}

let t: TestDatabase;
const tenantA = crypto.randomUUID();
const workspaceA = crypto.randomUUID();
let userA = "";
const token = "linear-sandbox-token";
const now = new Date("2026-11-25T09:00:00.000Z");
const params = {
  title: "Weekly review",
  teamId: "9cfb482a-81e3-4154-b5b9-2c805e70a02d",
  description: "Spend rose without a lead change.",
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

function deps(client: LinearConnector): WorkflowDeps {
  return {
    model: "gpt-test",
    gateway: { complete: async () => ({ content: "" }) } as unknown as WorkflowDeps["gateway"],
    listActions: async () => {
      throw new Error("listActions called");
    },
    executeAction: async () => {
      await client.createIssue(
        {
          tenantId: tenantA,
          workspaceId: workspaceA,
          connectionId: "pilot",
          credentials: { access_token: token },
        },
        {
          title: params.title,
          teamId: params.teamId,
          description: params.description,
          idempotencyKey: "pilot-leak",
        },
      );
    },
    async writeRecommendation() {},
    reader: {
      async metricValue(query) {
        return { metricKey: query.metricKey, status: "ok", value: 2550, unit: "EUR" };
      },
      async metricCompare(query) {
        return {
          metricKey: query.metricKey,
          status: "ok",
          current: 2550,
          previous: 2100,
          delta: 450,
          unit: "EUR",
        };
      },
    },
    async loadBusinessProfile() {
      return null;
    },
    async loadBrandProfile() {
      return null;
    },
    async loadPublishedSkill() {
      return null;
    },
    async retrieveKnowledge() {
      return { chunks: [], deniedSourceIds: [] };
    },
    async recordAudit() {},
  };
}

beforeAll(async () => {
  t = await createTestDatabase();
  userA = await t.createUser("pilot-a@example.com");
  await withContext(t.db, { tenantId: tenantA, userId: userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantA, slug: "pilot-a", name: "Pilot A" });
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

describe("pilot workflow fixture", () => {
  it("stops before approval and stores one issue id after it", async () => {
    const { client, calls } = fakeClient();
    const outcome = await interpretWorkflow(workflow, {
      tenantId: tenantA,
      workspaceId: workspaceA,
      deps: deps(client),
    });
    expect(outcome.status).toBe("awaiting_approval");
    expect(calls()).toBe(0);

    const reserve: ActionReserve = {
      tenantId: tenantA,
      workspaceId: workspaceA,
      connector: actionStep.connector,
      tool: actionStep.tool,
      params,
      idempotencyKey: "pilot-linear-issue",
      policies: [policy],
      autonomy: "approval_required" satisfies PolicyAutonomy,
      requesterId: userA,
      evidence: "mock.spend is 2550.",
      expectedImpact: "One tracked task.",
      now,
    };
    const reserved = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      reserveAction(tx, reserve),
    );
    expect(calls()).toBe(0);

    await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      decideApproval(tx, {
        approvalId: reserved.approvalId,
        reviewerId: userA,
        decision: "approved",
        comment: "Approved for the weekly review.",
        now,
      }),
    );
    const executed = await executeApprovedAction(t.db, {
      tenantId: tenantA,
      workspaceId: workspaceA,
      userId: userA,
      actorRole: "customer_admin",
      connector: actionStep.connector,
      tool: actionStep.tool,
      params,
      idempotencyKey: "pilot-linear-issue",
      accessToken: token,
      now,
      client,
    });
    expect(calls()).toBe(1);
    expect(executed.externalId).toBe("lin-1");

    const stored = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      readActionOutcome(tx, executed.intentId),
    );
    expect(stored).toEqual({
      actionId: executed.intentId,
      externalId: "lin-1",
      recordedAt: now,
    });
  });
});
