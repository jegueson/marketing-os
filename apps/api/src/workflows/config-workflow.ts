import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import {
  interpretWorkflow,
  type WorkflowStepDo,
} from "@marketing-os/workflow/interpreter";
import type { WorkflowOutcome } from "@marketing-os/workflow/port";
import { depsFromFixture } from "./fixture-deps";
import type { ConfigWorkflowParams } from "./params";

/**
 * Single Cloudflare Workflow class for published definitions (ADR-0026).
 * Each definition step runs inside `step.do` so Miniflare / production can resume.
 */
export class ConfigWorkflow extends WorkflowEntrypoint<Env, ConfigWorkflowParams> {
  override async run(
    event: WorkflowEvent<ConfigWorkflowParams>,
    step: WorkflowStep,
  ): Promise<WorkflowOutcome> {
    const params = event.payload;
    const deps = depsFromFixture(params.fixture);
    const runStep = ((name: string, fn: () => Promise<unknown>) =>
      step.do(name, async () => (await fn()) as never)) as WorkflowStepDo;
    return interpretWorkflow(
      params.definition,
      {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        deps,
      },
      { runStep },
    );
  }
}
