import type { LinearConnector } from "@marketing-os/connector-linear";
import {
  completeActionExecution,
  failActionExecution,
  prepareActionExecution,
  withContext,
  type Database,
} from "@marketing-os/db";
import { recordAudit } from "../lib/events";

export type ExecuteApprovedInput = {
  tenantId: string;
  workspaceId: string;
  userId: string;
  actorRole: string;
  connector: string;
  tool: string;
  params: {
    title: string;
    teamId: string;
    description?: string;
  };
  idempotencyKey: string;
  accessToken: string;
  now: Date;
  client: Pick<LinearConnector, "createIssue">;
};

/**
 * Call Linear only for an approved intent that is still inside expires_at.
 * A replay returns the stored external id and does not call again.
 * Audit payloads store the outcome id or the failed status, never the token.
 */
export async function executeApprovedAction(
  db: Database,
  input: ExecuteApprovedInput,
): Promise<{ intentId: string; externalId: string }> {
  const prepared = await withContext(db, context(input), (tx) => prepareActionExecution(tx, input));
  if (prepared.state === "replay") {
    return { intentId: prepared.intentId, externalId: prepared.externalId };
  }

  let externalId: string;
  try {
    const created = await input.client.createIssue(connectorContext(input, prepared.intentId), {
      title: input.params.title,
      teamId: input.params.teamId,
      idempotencyKey: prepared.idempotencyKey,
      ...(input.params.description !== undefined ? { description: input.params.description } : {}),
    });
    externalId = created.id;
  } catch (error) {
    await withContext(db, context(input), async (tx) => {
      await failActionExecution(tx, prepared.intentId);
      await recordAudit(tx, {
        eventType: "action.failed",
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        actorId: input.userId,
        actorRole: input.actorRole,
        resourceType: "action_intent",
        resourceId: prepared.intentId,
        payload: { status: "failed" },
      });
    });
    throw error;
  }

  await withContext(db, context(input), async (tx) => {
    await completeActionExecution(tx, prepared.intentId, externalId, input.now);
    await recordAudit(tx, {
      eventType: "action.executed",
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      actorId: input.userId,
      actorRole: input.actorRole,
      resourceType: "action_intent",
      resourceId: prepared.intentId,
      payload: { externalId },
    });
  });
  return { intentId: prepared.intentId, externalId };
}

function context(input: ExecuteApprovedInput) {
  return { tenantId: input.tenantId, userId: input.userId, staff: false as const };
}

function connectorContext(input: ExecuteApprovedInput, intentId: string) {
  return {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    connectionId: intentId,
    credentials: { access_token: input.accessToken },
  };
}
