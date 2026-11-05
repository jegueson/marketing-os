import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { formatLogLine } from "@marketing-os/core";
import { outboxEvents, withContext, type Database } from "@marketing-os/db";
import { systemContext } from "../context";

/** Message body sent to `OUTBOX_QUEUE`. */
export type OutboxMessage = {
  id: number;
  type: string;
  tenantId: string | null;
  payload: Record<string, unknown>;
  occurredAt: string;
};

export type OutboxProducer = {
  sendBatch(messages: Iterable<{ body: OutboxMessage }>): Promise<unknown>;
};

export const RELAY_BATCH_SIZE = 50;
export const MAX_RELAY_ATTEMPTS = 5;

export type RelayResult = { delivered: number; failed: number };

/**
 * Moves pending outbox rows to the queue. Rows are locked with SKIP LOCKED so
 * overlapping cron runs never send the same row twice in one pass.
 */
export async function relayOutbox(db: Database, queue: OutboxProducer): Promise<RelayResult> {
  return withContext(db, systemContext, async (tx) => {
    const batch = await tx
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.status, "pending"))
      .orderBy(asc(outboxEvents.id))
      .limit(RELAY_BATCH_SIZE)
      .for("update", { skipLocked: true });
    if (batch.length === 0) return { delivered: 0, failed: 0 };

    const ids = batch.map((row) => row.id);
    try {
      await queue.sendBatch(
        batch.map((row) => ({
          body: {
            id: row.id,
            type: row.eventType,
            tenantId: row.tenantId,
            payload: row.payload as Record<string, unknown>,
            occurredAt: new Date(row.createdAt).toISOString(),
          },
        })),
      );
    } catch (err) {
      await markFailedAttempt(tx, ids, err);
      return { delivered: 0, failed: ids.length };
    }
    await tx
      .update(outboxEvents)
      .set({ status: "delivered", deliveredAt: sql`now()`, lastAttemptedAt: sql`now()`, attempts: sql`${outboxEvents.attempts} + 1` })
      .where(inArray(outboxEvents.id, ids));
    return { delivered: ids.length, failed: 0 };
  });
}

async function markFailedAttempt(tx: Database, ids: number[], err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  console.error(formatLogLine({ level: "error", message: "outbox relay send failed", count: ids.length, error: message }));
  await tx
    .update(outboxEvents)
    .set({
      attempts: sql`${outboxEvents.attempts} + 1`,
      lastAttemptedAt: sql`now()`,
      errorMessage: message.slice(0, 500),
      status: sql`case when ${outboxEvents.attempts} + 1 >= ${MAX_RELAY_ATTEMPTS} then 'failed' else 'pending' end`,
    })
    .where(and(inArray(outboxEvents.id, ids), eq(outboxEvents.status, "pending")));
}
