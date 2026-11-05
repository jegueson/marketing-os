import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHarness, provisionCustomer, type Harness, type ProvisionedCustomer } from "../testing/harness";
import { consumeBatch, processEvent, type EventHandler } from "./consumer";
import { MAX_RELAY_ATTEMPTS, relayOutbox, type OutboxMessage, type OutboxProducer } from "./relay";

class FakeQueue implements OutboxProducer {
  readonly sent: OutboxMessage[] = [];
  fail = false;

  async sendBatch(messages: Iterable<{ body: OutboxMessage }>): Promise<void> {
    if (this.fail) throw new Error("queue unavailable");
    for (const message of messages) this.sent.push(message.body);
  }
}

function message(body: OutboxMessage) {
  const state = { acked: false, retried: false };
  return {
    state,
    body,
    ack: () => {
      state.acked = true;
    },
    retry: () => {
      state.retried = true;
    },
  };
}

describe("outbox relay and consumer", () => {
  let h: Harness;
  let acme: ProvisionedCustomer;

  beforeEach(async () => {
    h = await createHarness();
    const sm = await h.user("sm@example.com", "success_manager");
    acme = await provisionCustomer(h, sm, "Acme", "owner@acme.test");
  });
  afterEach(() => h.close());

  it("delivers pending events once", async () => {
    const queue = new FakeQueue();
    const first = await relayOutbox(h.testDb.db, queue);
    expect(first.delivered).toBeGreaterThanOrEqual(2);
    expect(queue.sent.map((e) => e.type)).toEqual(expect.arrayContaining(["lead.created", "customer.provisioned"]));
    expect((await relayOutbox(h.testDb.db, queue)).delivered).toBe(0);
  });

  it("keeps events pending on send failure, then marks them failed", async () => {
    const queue = new FakeQueue();
    queue.fail = true;
    for (let i = 0; i < MAX_RELAY_ATTEMPTS; i += 1) await relayOutbox(h.testDb.db, queue);
    const { rows } = await h.testDb.pg.query<{ status: string; attempts: number }>(
      "select distinct status, attempts::int from outbox_events",
    );
    expect(rows).toEqual([{ status: "failed", attempts: MAX_RELAY_ATTEMPTS }]);
  });

  it("completes the connect_source item on integration.connected, idempotently", async () => {
    const event: OutboxMessage = {
      id: 0,
      type: "integration.connected",
      tenantId: acme.tenantId,
      payload: { workspaceId: acme.workspaceId, connectionId: "c" },
      occurredAt: new Date().toISOString(),
    };
    const { rows: ids } = await h.testDb.pg.query<{ id: number }>(
      "insert into outbox_events (tenant_id, event_type, payload) values ($1, 'integration.connected', '{}') returning id::int",
      [acme.tenantId],
    );
    event.id = ids[0]!.id;

    expect(await processEvent(h.testDb.db, event)).toBe(true);
    expect(await processEvent(h.testDb.db, event)).toBe(false);
    const { rows } = await h.testDb.pg.query<{ status: string }>(
      "select status from onboarding_checklist_items where tenant_id = $1 and key = 'connect_source'",
      [acme.tenantId],
    );
    expect(rows[0]?.status).toBe("completed");
  });

  it("retries a message whose handler fails and leaves no receipt", async () => {
    const { rows: ids } = await h.testDb.pg.query<{ id: number }>(
      "insert into outbox_events (tenant_id, event_type, payload) values ($1, 'integration.connected', '{}') returning id::int",
      [acme.tenantId],
    );
    const broken: EventHandler = {
      name: "broken",
      handle: async () => {
        throw new Error("boom");
      },
    };
    const msg = message({
      id: ids[0]!.id,
      type: "integration.connected",
      tenantId: acme.tenantId,
      payload: {},
      occurredAt: new Date().toISOString(),
    });
    await consumeBatch(h.testDb.db, [msg], { "integration.connected": [broken] });
    expect(msg.state).toEqual({ acked: false, retried: true });
    const { rows } = await h.testDb.pg.query("select 1 from event_receipts where handler = 'broken'");
    expect(rows).toHaveLength(0);
  });
});
