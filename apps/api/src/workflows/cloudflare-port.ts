import type {
  CompleteWorkflowInput,
  GetWorkflowInput,
  StartWorkflowInput,
  WorkflowOutcome,
  WorkflowPort,
  WorkflowRun,
  WorkflowRunStatus,
} from "@marketing-os/workflow";
import type { ConfigWorkflowParams } from "./params";

type WorkflowBinding = Workflow<ConfigWorkflowParams>;

export type CloudflareWorkflowPortOptions = {
  /**
   * Builds serializable params for ConfigWorkflow.create.
   * Production loads definition + profiles from the DB; tests pass the fixture.
   */
  resolveParams: (
    input: StartWorkflowInput & { runId: string },
  ) => Promise<ConfigWorkflowParams>;
};

type RunMeta = {
  tenantId: string;
  workspaceId: string;
  workflowId: string;
  workflowVersion: number;
  createdAt: string;
};

function mapInstanceStatus(status: InstanceStatus["status"]): WorkflowRunStatus {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
    case "waiting":
    case "waitingForPause":
    case "paused":
    case "unknown":
      return "running";
    case "complete":
      return "succeeded";
    case "errored":
    case "terminated":
      return "failed";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function isOutcome(value: unknown): value is WorkflowOutcome {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.status !== "succeeded" && record.status !== "failed") return false;
  return Array.isArray(record.steps);
}

/**
 * WorkflowPort backed by a Cloudflare Workflows binding.
 * Domain packages never import this module.
 *
 * Run metadata is held in-process for local/Miniflare. Production (S4-T23)
 * should persist rows in `workflow_runs` so get() survives isolate cold starts.
 */
export function createCloudflareWorkflowPort(
  binding: WorkflowBinding,
  options: CloudflareWorkflowPortOptions,
): WorkflowPort {
  const metaByRunId = new Map<string, RunMeta>();

  return {
    async start(input: StartWorkflowInput): Promise<{ runId: string }> {
      const runId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const params = await options.resolveParams({ ...input, runId });
      metaByRunId.set(runId, {
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        workflowVersion: input.workflowVersion,
        createdAt,
      });
      await binding.create({ id: runId, params });
      return { runId };
    },

    async get(input: GetWorkflowInput): Promise<WorkflowRun | null> {
      const meta = metaByRunId.get(input.runId);
      if (!meta || meta.tenantId !== input.tenantId) return null;
      try {
        const instance = await binding.get(input.runId);
        const status = await instance.status();
        const outcome = isOutcome(status.output) ? status.output : null;
        const mapped = mapInstanceStatus(status.status);
        let finishedStatus: WorkflowRunStatus = mapped;
        let errorCode: string | null = null;
        if (mapped === "succeeded") {
          if (!outcome) {
            finishedStatus = "failed";
            errorCode = "step_failed";
          } else {
            finishedStatus = outcome.status;
            errorCode = outcome.errorCode;
          }
        } else if (outcome) {
          errorCode = outcome.errorCode;
        } else if (status.error) {
          errorCode = "step_failed";
        }
        return {
          id: input.runId,
          tenantId: meta.tenantId,
          workspaceId: meta.workspaceId,
          workflowId: meta.workflowId,
          workflowVersion: meta.workflowVersion,
          trigger: "manual",
          status: finishedStatus,
          createdAt: meta.createdAt,
          updatedAt: new Date().toISOString(),
          errorCode,
          steps: (outcome?.steps ?? []).map((step) => ({ ...step })),
          report: outcome?.report ? { ...outcome.report } : null,
        };
      } catch {
        return null;
      }
    },

    async complete(_input: CompleteWorkflowInput): Promise<boolean> {
      // ConfigWorkflow attaches the outcome itself via run() return value.
      return false;
    },
  };
}
