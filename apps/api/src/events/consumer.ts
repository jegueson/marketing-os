import { and, eq, ne } from "drizzle-orm";
import { formatLogLine } from "@marketing-os/core";
import {
  eventReceipts,
  onboardingChecklistItems,
  onboardingProjects,
  withContext,
  type Database,
} from "@marketing-os/db";
import { refreshProjectStatus } from "../routes/onboarding";
import type { OutboxMessage } from "./relay";

export type EventHandler = {
  name: string;
  handle(tx: Database, event: OutboxMessage): Promise<void>;
};

const completeConnectSource: EventHandler = {
  name: "onboarding.complete_connect_source",
  async handle(tx, event) {
    const workspaceId = event.payload["workspaceId"];
    if (typeof workspaceId !== "string") {
      throw new Error(`Event ${event.id} has no workspaceId`);
    }
    const [project] = await tx
      .select({ id: onboardingProjects.id })
      .from(onboardingProjects)
      .where(eq(onboardingProjects.workspaceId, workspaceId));
    if (!project) return;
    const now = new Date();
    await tx
      .update(onboardingChecklistItems)
      .set({ status: "completed", completedAt: now, updatedAt: now })
      .where(
        and(
          eq(onboardingChecklistItems.projectId, project.id),
          eq(onboardingChecklistItems.key, "connect_source"),
          ne(onboardingChecklistItems.status, "completed"),
        ),
      );
    await refreshProjectStatus(tx, project.id);
  },
};

export const defaultHandlers: Readonly<Record<string, readonly EventHandler[]>> = {
  "integration.connected": [completeConnectSource],
};

/**
 * Runs each handler once per event. The receipt insert and the handler share a
 * transaction, so a crash before commit leaves no receipt and the retry runs again.
 * Returns false when every handler had already run.
 */
export async function processEvent(
  db: Database,
  event: OutboxMessage,
  handlers: Readonly<Record<string, readonly EventHandler[]>> = defaultHandlers,
): Promise<boolean> {
  let ran = false;
  for (const handler of handlers[event.type] ?? []) {
    await withContext(db, { tenantId: event.tenantId, userId: null, staff: true }, async (tx) => {
      const [receipt] = await tx
        .insert(eventReceipts)
        .values({ eventId: event.id, handler: handler.name })
        .onConflictDoNothing()
        .returning({ eventId: eventReceipts.eventId });
      if (!receipt) return;
      await handler.handle(tx, event);
      ran = true;
    });
  }
  return ran;
}

export type QueueMessage<T> = { body: T; ack(): void; retry(): void };

export async function consumeBatch(
  db: Database,
  messages: readonly QueueMessage<OutboxMessage>[],
  handlers?: Readonly<Record<string, readonly EventHandler[]>>,
): Promise<void> {
  for (const message of messages) {
    try {
      await processEvent(db, message.body, handlers);
      message.ack();
    } catch (err) {
      console.error(
        formatLogLine({
          level: "error",
          message: "outbox event handler failed",
          eventId: message.body.id,
          eventType: message.body.type,
          ...(message.body.tenantId ? { tenantId: message.body.tenantId } : {}),
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      message.retry();
    }
  }
}
