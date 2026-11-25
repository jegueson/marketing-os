import { describe, expect, it, vi } from "vitest";
import type { WorkflowDefinition } from "@marketing-os/schemas";
import type { WorkflowDeps } from "./interpreter";
import { interpretWorkflow } from "./interpreter";
import { tickSchedule } from "./triggers";

const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const workspaceA = "11111111-1111-4111-8111-111111111111";
const mondayMorning = new Date("2026-11-23T08:00:00.000Z");

const scheduledAction: WorkflowDefinition = {
  name: "weekly-linear-issue",
  version: "1.0.0",
  description: "Monday review that stops before creating a Linear issue.",
  trigger: { type: "schedule", minute: 0, hour: 8, dayOfWeek: 1 },
  steps: [
    {
      id: "spend",
      kind: "read_metrics",
      metricKey: "mock.spend",
      range: "last_30_days",
      compareToPrevious: false,
    },
    { id: "report", kind: "render_report", title: "Weekly review", fromSteps: ["spend"] },
    { id: "issue", kind: "action", connector: "linear", tool: "create_issue" },
  ],
};

function thresholdWorkflow(above: number): WorkflowDefinition {
  return {
    name: "spend-threshold",
    version: "1.0.0",
    description: "Recommend a review when mock spend is over the line.",
    trigger: { type: "manual" },
    steps: [{ id: "spend", kind: "threshold", metricKey: "mock.spend", above }],
  };
}

function harness() {
  const recommendations: { problem: string; evidence: string }[] = [];
  const executeAction = vi.fn(async () => {
    throw new Error("connector called");
  });
  const listActions = vi.fn(async () => {
    throw new Error("listActions called");
  });
  const deps: WorkflowDeps = {
    model: "gpt-test",
    gateway: { complete: vi.fn(async () => ({ content: "" })) } as unknown as WorkflowDeps["gateway"],
    listActions,
    executeAction,
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
    async writeRecommendation(draft) {
      recommendations.push({ problem: draft.problem, evidence: draft.evidence });
    },
  };
  return { deps, recommendations, executeAction, listActions };
}

describe("workflow triggers", () => {
  it("starts a due schedule and performs zero connector calls", async () => {
    const { deps, executeAction, listActions } = harness();
    const outcomes = await tickSchedule({
      now: mondayMorning,
      workflows: [scheduledAction],
      tenantId: tenantA,
      workspaceId: workspaceA,
      deps,
    });
    expect(outcomes).toEqual([
      expect.objectContaining({
        status: "awaiting_approval",
        errorCode: null,
        report: { title: "Weekly review", body: expect.stringContaining("2550") },
      }),
    ]);
    expect(executeAction).not.toHaveBeenCalled();
    expect(listActions).not.toHaveBeenCalled();
  });

  it("writes one recommendation when mock.spend is over the line", async () => {
    const { deps, recommendations, executeAction } = harness();
    const outcome = await interpretWorkflow(thresholdWorkflow(2000), {
      tenantId: tenantA,
      workspaceId: workspaceA,
      deps,
    });
    expect(outcome.status).toBe("succeeded");
    expect(recommendations).toEqual([
      expect.objectContaining({
        problem: "Spend rose without a lead change.",
        evidence: expect.stringContaining("2550"),
      }),
    ]);
    expect(executeAction).not.toHaveBeenCalled();
  });

  it("writes nothing when mock.spend is under the line", async () => {
    const { deps, recommendations, executeAction } = harness();
    const outcome = await interpretWorkflow(thresholdWorkflow(3000), {
      tenantId: tenantA,
      workspaceId: workspaceA,
      deps,
    });
    expect(outcome.status).toBe("succeeded");
    expect(recommendations).toEqual([]);
    expect(executeAction).not.toHaveBeenCalled();
  });
});
