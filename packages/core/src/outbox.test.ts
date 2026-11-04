import { describe, expect, it } from "vitest";
import { assertEventEnvelope, relayReady } from "./outbox";

describe("outbox", () => {
  it("requires tenant_id for domain events", () => {
    expect(() =>
      assertEventEnvelope({
        id: "11111111-1111-1111-1111-111111111111",
        type: "lead.created",
        tenantId: null,
        occurredAt: new Date().toISOString(),
        payload: {},
        idempotencyKey: "k1",
      }),
    ).toThrow(/tenant_id/);
  });

  it("relays unpublished events", () => {
    const ready = relayReady([
      {
        id: "11111111-1111-1111-1111-111111111111",
        type: "platform.ping",
        tenantId: null,
        occurredAt: new Date(0).toISOString(),
        payload: {},
        idempotencyKey: "k1",
        publishedAt: null,
      },
    ]);
    expect(ready).toHaveLength(1);
  });
});
