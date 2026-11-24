import type {
  CompleteWorkflowInput,
  GetWorkflowInput,
  StartWorkflowInput,
  WorkflowPort,
  WorkflowRun,
} from "./port";

/**
 * Test double. No Workers binding. Runs stay in process memory.
 * A later Cloudflare adapter keeps the same `WorkflowPort` shape.
 */
export function createInMemoryWorkflowPort(): WorkflowPort {
  const runs = new Map<string, WorkflowRun>();

  return {
    async start(input: StartWorkflowInput): Promise<{ runId: string }> {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const run: WorkflowRun = {
        id,
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        workflowVersion: input.workflowVersion,
        trigger: input.trigger,
        status: "queued",
        createdAt: now,
        updatedAt: now,
        errorCode: null,
        steps: [],
        report: null,
      };
      runs.set(id, run);
      return { runId: id };
    },

    async get(input: GetWorkflowInput): Promise<WorkflowRun | null> {
      const run = runs.get(input.runId);
      if (!run || run.tenantId !== input.tenantId) return null;
      return {
        ...run,
        steps: run.steps.map((step) => ({ ...step })),
        report: run.report ? { ...run.report } : null,
      };
    },

    async complete(input: CompleteWorkflowInput): Promise<boolean> {
      const run = runs.get(input.runId);
      if (!run || run.tenantId !== input.tenantId) return false;
      if (run.status !== "queued" && run.status !== "running") return false;
      const now = new Date().toISOString();
      runs.set(input.runId, {
        ...run,
        status: input.outcome.status,
        errorCode: input.outcome.errorCode,
        steps: input.outcome.steps.map((step) => ({ ...step })),
        report: input.outcome.report ? { ...input.outcome.report } : null,
        updatedAt: now,
      });
      return true;
    },
  };
}
