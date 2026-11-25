import type { WorkflowDefinition } from "@marketing-os/schemas";
import { interpretWorkflow, type WorkflowDeps } from "./interpreter";
import type { WorkflowOutcome } from "./port";

type ScheduleTrigger = Extract<WorkflowDefinition["trigger"], { type: "schedule" }>;

/** True when the UTC clock is on this workflow's single slot. */
export function scheduleIsDue(trigger: ScheduleTrigger, now: Date): boolean {
  return (
    now.getUTCMinutes() === trigger.minute &&
    now.getUTCHours() === trigger.hour &&
    (trigger.dayOfWeek === "*" || now.getUTCDay() === trigger.dayOfWeek)
  );
}

/** Start each due schedule. Manual definitions are left for the test-run route. */
export async function tickSchedule(input: {
  now: Date;
  workflows: readonly WorkflowDefinition[];
  tenantId: string;
  workspaceId: string;
  deps: WorkflowDeps;
}): Promise<WorkflowOutcome[]> {
  const due = input.workflows.filter(
    (workflow) => workflow.trigger.type === "schedule" && scheduleIsDue(workflow.trigger, input.now),
  );
  const outcomes: WorkflowOutcome[] = [];
  for (const workflow of due) {
    outcomes.push(
      await interpretWorkflow(workflow, {
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        deps: input.deps,
      }),
    );
  }
  return outcomes;
}
