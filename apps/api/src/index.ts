import { createDb } from "@marketing-os/db";
import { createApp } from "./app";
import { defaultDeps } from "./deps";
import { loadEnv } from "./env";
import { consumeBatch } from "./events/consumer";
import { relayOutbox, type OutboxMessage } from "./events/relay";
import { consumeSyncBatch, enqueueDueSyncs, type SyncMessage } from "./sync/engine";

const app = createApp();

export default {
  fetch: app.fetch,

  async scheduled(_controller, env, ctx) {
    if (!env.OUTBOX_QUEUE) {
      throw new Error("OUTBOX_QUEUE binding is required for the outbox relay");
    }
    const handle = createDb(loadEnv(env).databaseUrl);
    try {
      await relayOutbox(handle.db, env.OUTBOX_QUEUE);
      if (env.SYNC_QUEUE) {
        const messages = await enqueueDueSyncs(handle.db);
        if (messages.length) await env.SYNC_QUEUE.sendBatch(messages.map((body) => ({ body })));
      }
    } finally {
      ctx.waitUntil(handle.close());
    }
  },

  async queue(batch, env, ctx) {
    const handle = createDb(loadEnv(env).databaseUrl);
    try {
      if (batch.queue === "mos-sync") {
        await consumeSyncBatch(
          handle.db,
          batch.messages as readonly { body: SyncMessage; ack(): void; retry(): void }[],
          defaultDeps.connectors,
        );
      } else {
        await consumeBatch(handle.db, batch.messages as Parameters<typeof consumeBatch>[1]);
      }
    } finally {
      ctx.waitUntil(handle.close());
    }
  },
} satisfies ExportedHandler<Env, OutboxMessage | SyncMessage>;
