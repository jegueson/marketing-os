import { z } from "zod";

export const eventEnvelopeSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  tenantId: z.string().uuid().nullable(),
  occurredAt: z.string().datetime(),
  payload: z.record(z.unknown()),
  idempotencyKey: z.string().min(1),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export function assertEventEnvelope(event: EventEnvelope): EventEnvelope {
  const parsed = eventEnvelopeSchema.parse(event);
  if (!parsed.tenantId && !parsed.type.startsWith("platform.")) {
    throw new Error("tenant_id required for non-platform events");
  }
  return parsed;
}

export type OutboxRecord = EventEnvelope & {
  publishedAt: string | null;
};

export function relayReady(events: OutboxRecord[], now = new Date()): OutboxRecord[] {
  return events.filter((e) => e.publishedAt === null && new Date(e.occurredAt) <= now);
}
