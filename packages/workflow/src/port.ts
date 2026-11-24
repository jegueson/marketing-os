/**
 * Durable automation port (ADR-0012 / ADR-0026).
 * Domain code calls this. Cloudflare Workflows live only in the adapter.
 */
export type WorkflowRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type WorkflowTriggerKind = "manual" | "schedule";

export type StartWorkflowInput = {
  tenantId: string;
  workspaceId: string;
  /** Published workflow row id. */
  workflowId: string;
  /** Active version number on that row. */
  workflowVersion: number;
  /** Sprint 4 only starts manual runs. Schedule rows exist; the runner refuses them until later. */
  trigger: "manual";
};

export type WorkflowStepResult = {
  stepId: string;
  kind: string;
  status: "ok" | "error" | "skipped";
  output: unknown;
  errorCode: string | null;
};

export type WorkflowReport = {
  title: string;
  body: string;
};

export type WorkflowOutcome = {
  status: "succeeded" | "failed";
  errorCode: string | null;
  steps: WorkflowStepResult[];
  report: WorkflowReport | null;
};

export type WorkflowRun = {
  id: string;
  tenantId: string;
  workspaceId: string;
  workflowId: string;
  workflowVersion: number;
  trigger: WorkflowTriggerKind;
  status: WorkflowRunStatus;
  createdAt: string;
  updatedAt: string;
  errorCode: string | null;
  steps: WorkflowStepResult[];
  report: WorkflowReport | null;
};

export type GetWorkflowInput = {
  tenantId: string;
  runId: string;
};

export type CompleteWorkflowInput = {
  tenantId: string;
  runId: string;
  outcome: WorkflowOutcome;
};

export interface WorkflowPort {
  start(input: StartWorkflowInput): Promise<{ runId: string }>;
  /** Returns null when the run is missing or belongs to another tenant. */
  get(input: GetWorkflowInput): Promise<WorkflowRun | null>;
  /** Attaches interpreter output. Missing or foreign runs are a no-op that returns false. */
  complete(input: CompleteWorkflowInput): Promise<boolean>;
}
