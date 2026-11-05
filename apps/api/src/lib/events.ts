import { assertEventEnvelope, type EventType } from "@marketing-os/core";
import { auditEvents, outboxEvents, type Database } from "@marketing-os/db";

export type AuditInput = {
  eventType: string;
  tenantId?: string | null;
  workspaceId?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  resourceType?: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
  requestId?: string;
};

/** Writes in the caller's transaction, so a rollback removes the audit row too. */
export async function recordAudit(tx: Database, input: AuditInput): Promise<void> {
  await tx.insert(auditEvents).values({
    eventType: input.eventType,
    tenantId: input.tenantId ?? null,
    workspaceId: input.workspaceId ?? null,
    actorId: input.actorId ?? null,
    actorRole: input.actorRole ?? null,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    payload: input.payload ?? {},
    requestId: input.requestId ?? null,
  });
}

/** Transactional outbox: the event commits or rolls back with the business change. */
export async function enqueueEvent(
  tx: Database,
  type: EventType,
  tenantId: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  assertEventEnvelope({
    id: crypto.randomUUID(),
    type,
    tenantId,
    occurredAt: new Date().toISOString(),
    payload,
    idempotencyKey: crypto.randomUUID(),
  });
  await tx.insert(outboxEvents).values({ eventType: type, tenantId, payload });
}
