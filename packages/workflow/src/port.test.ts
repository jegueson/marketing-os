import { describe, expect, it } from "vitest";
import { createInMemoryWorkflowPort } from "./memory";
import type { StartWorkflowInput } from "./port";

const base: StartWorkflowInput = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  workflowId: "33333333-3333-4333-8333-333333333333",
  workflowVersion: 1,
  trigger: "manual",
};

describe("in-memory WorkflowPort", () => {
  it("starts a run and returns that run by id", async () => {
    const port = createInMemoryWorkflowPort();
    const started = await port.start(base);
    expect(started.runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const run = await port.get({ tenantId: base.tenantId, runId: started.runId });
    expect(run).toMatchObject({
      id: started.runId,
      tenantId: base.tenantId,
      workspaceId: base.workspaceId,
      workflowId: base.workflowId,
      workflowVersion: 1,
      trigger: "manual",
      status: "queued",
      steps: [],
      report: null,
    });
  });

  it("does not resolve a run for a second tenant", async () => {
    const port = createInMemoryWorkflowPort();
    const started = await port.start(base);
    const other = await port.get({
      tenantId: "44444444-4444-4444-8444-444444444444",
      runId: started.runId,
    });
    expect(other).toBeNull();
    expect(await port.get({ tenantId: base.tenantId, runId: crypto.randomUUID() })).toBeNull();
  });

  it("rejects a second complete on a finished run", async () => {
    const port = createInMemoryWorkflowPort();
    const started = await port.start(base);
    const outcome = {
      status: "succeeded" as const,
      errorCode: null,
      steps: [],
      report: { title: "Weekly review", body: "mock.spend: 2550 EUR" },
    };
    expect(await port.complete({ tenantId: base.tenantId, runId: started.runId, outcome })).toBe(true);
    expect(await port.complete({ tenantId: base.tenantId, runId: started.runId, outcome })).toBe(false);
    const run = await port.get({ tenantId: base.tenantId, runId: started.runId });
    expect(run?.status).toBe("succeeded");
  });
});
