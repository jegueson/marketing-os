import { describe, expect, it } from "vitest";
import { assertEventEnvelope, relayReady, type EventEnvelope } from "./outbox";

function event(overrides: Partial<EventEnvelope>): EventEnvelope {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    type: "integration.connected",
    tenantId: null,
    occurredAt: new Date().toISOString(),
    payload: {},
    idempotencyKey: "k1",
    ...overrides,
  };
}

describe("outbox", () => {
  it("requires tenant_id for tenant events", () => {
    expect(() => assertEventEnvelope(event({ type: "integration.connected" }))).toThrow(/tenant_id/);
  });

  it("allows allowlisted platform events without tenant_id", () => {
    expect(assertEventEnvelope(event({ type: "lead.created" })).type).toBe("lead.created");
  });

  it("accepts tenant events with tenant_id", () => {
    const tenantId = "22222222-2222-2222-2222-222222222222";
    expect(assertEventEnvelope(event({ tenantId })).tenantId).toBe(tenantId);
  });

  it("relays unpublished events", () => {
    const ready = relayReady([
      { ...event({ type: "lead.created", occurredAt: new Date(0).toISOString() }), publishedAt: null },
    ]);
    expect(ready).toHaveLength(1);
  });
});
