import { eq } from "drizzle-orm";
import type { Database } from "./context";
import { actionOutcomes } from "./schema/action-outcomes";

export type ActionOutcome = {
  actionId: string;
  externalId: string;
  recordedAt: Date;
};

const columns = {
  actionId: actionOutcomes.actionId,
  externalId: actionOutcomes.externalId,
  recordedAt: actionOutcomes.recordedAt,
};

/** Read the one success row for an action. A failure has no row. */
export async function readActionOutcome(tx: Database, actionId: string): Promise<ActionOutcome | null> {
  const [row] = await tx.select(columns).from(actionOutcomes).where(eq(actionOutcomes.actionId, actionId));
  return row ?? null;
}

/** Insert the success row. The action intent id is unique, so a replay cannot add another. */
export async function insertActionOutcome(
  tx: Database,
  draft: ActionOutcome & { tenantId: string; workspaceId: string },
): Promise<void> {
  await tx.insert(actionOutcomes).values({
    tenantId: draft.tenantId,
    workspaceId: draft.workspaceId,
    actionId: draft.actionId,
    externalId: draft.externalId,
    recordedAt: draft.recordedAt,
  });
}
