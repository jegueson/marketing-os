import { z } from "zod";

/** Events that exist before a tenant does. Every other event must carry tenant_id. */
export const platformEventTypes = ["lead.created"] as const;

export const eventTypes = [
  ...platformEventTypes,
  "customer.provisioned",
  "integration.connected",
  "integration.failed",
] as const;

export type EventType = (typeof eventTypes)[number];

export const eventEnvelopeSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  tenantId: z.string().uuid().nullable(),
  occurredAt: z.string().datetime(),
  payload: z.record(z.unknown()),
  idempotencyKey: z.string().min(1),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export function isPlatformEvent(type: string): boolean {
  return (platformEventTypes as readonly string[]).includes(type);
}

export function assertEventEnvelope(event: EventEnvelope): EventEnvelope {
  const parsed = eventEnvelopeSchema.parse(event);
  if (!parsed.tenantId && !isPlatformEvent(parsed.type)) {
    throw new Error(`tenant_id required for event ${parsed.type}`);
  }
  return parsed;
}

export type OutboxRecord = EventEnvelope & {
  publishedAt: string | null;
};

export function relayReady(events: OutboxRecord[], now = new Date()): OutboxRecord[] {
  return events.filter((e) => e.publishedAt === null && new Date(e.occurredAt) <= now);
}
