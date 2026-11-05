import { createDb } from "@marketing-os/db";
import { createApp } from "./app";
import { loadEnv } from "./env";
import { consumeBatch } from "./events/consumer";
import { relayOutbox, type OutboxMessage } from "./events/relay";

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
    } finally {
      ctx.waitUntil(handle.close());
    }
  },

  async queue(batch, env, ctx) {
    const handle = createDb(loadEnv(env).databaseUrl);
    try {
      await consumeBatch(handle.db, batch.messages);
    } finally {
      ctx.waitUntil(handle.close());
    }
  },
} satisfies ExportedHandler<Env, OutboxMessage>;
