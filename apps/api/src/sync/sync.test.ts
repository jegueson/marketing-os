import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockConnector } from "@marketing-os/connector-mock";
import { ConnectorError, type ConnectorContext, type MetricQuery, type MetricResult } from "@marketing-os/connector-sdk";
import { metricValues } from "@marketing-os/db";
import { eq } from "drizzle-orm";
import { createHarness, provisionCustomer, type Harness, type ProvisionedCustomer, type TestUser } from "../testing/harness";
import { consumeSyncMessage, enqueueDueSyncs, type SyncMessage } from "./engine";

class RateLimitedOnce extends MockConnector {
  calls = 0;
  override async queryMetrics(ctx: ConnectorContext, query: MetricQuery): Promise<MetricResult[]> {
    this.calls += 1;
    if (this.calls === 1) throw new ConnectorError("slow down", "rate_limited", true);
    return super.queryMetrics(ctx, query);
  }
}

describe("sync engine", () => {
  let h: Harness;
  let sm: TestUser;
  let acme: ProvisionedCustomer;
  let base: string;

  beforeEach(async () => {
    h = await createHarness();
    sm = await h.user("sm@example.com", "success_manager");
    acme = await provisionCustomer(h, sm, "Acme", "owner@acme.test");
    base = `/api/v1/workspaces/${acme.workspaceId}`;
  });
  afterEach(() => h.close());

  async function connectionWithScope(): Promise<string> {
    const created = await h.call<{ id: string }>(`${base}/connections`, {
      method: "POST",
      body: { connectorSlug: "mock", displayName: "Mock data" },
      token: acme.admin.token,
    });
    const id = created.body.data.id;
    await h.call(`${base}/connections/${id}/scopes`, {
      method: "PUT",
      body: { resources: [{ resourceType: "account", resourceId: "mock-account-1" }] },
      token: acme.admin.token,
    });
    return id;
  }

  it("refuses a manual sync until scopes are selected, then queues a 90-day backfill", async () => {
    const created = await h.call<{ id: string }>(`${base}/connections`, {
      method: "POST",
      body: { connectorSlug: "mock", displayName: "Mock data" },
      token: acme.admin.token,
    });
    const blocked = await h.call(`${base}/connections/${created.body.data.id}/sync`, {
      method: "POST",
      token: acme.admin.token,
    });
    expect(blocked.status).toBe(422);

    const id = await connectionWithScope();
    const queued = await h.call<{ runs: number }>(`${base}/connections/${id}/sync`, {
      method: "POST",
      token: acme.admin.token,
    });
    expect(queued.status).toBe(202);
    expect(queued.body.data.runs).toBe(3);
  });

  it("syncs the mock connector, ignores a re-run, and retries a rate limit", async () => {
    const id = await connectionWithScope();
    const scheduled = await enqueueDueSyncs(h.testDb.db);
    const mine = scheduled.filter((message) => message.connectionId === id);
    expect(mine.length).toBe(3);
    const connectors = new Map([["mock", new MockConnector()]]);
    expect(await consumeSyncMessage(h.testDb.db, mine[0]!, connectors)).toBe("ack");
    expect(await consumeSyncMessage(h.testDb.db, mine[0]!, connectors)).toBe("ack");
    const values = await h.testDb.db.select().from(metricValues).where(eq(metricValues.connectionId, id));
    expect(values.length).toBe(3);
    expect(values.every((row) => row.definitionVersion === "1")).toBe(true);

    const limited = new RateLimitedOnce();
    const again = await consumeSyncMessage(h.testDb.db, mine[1]!, new Map([["mock", limited]]));
    expect(again).toBe("retry");
    expect(await consumeSyncMessage(h.testDb.db, mine[1]!, new Map([["mock", limited]]))).toBe("ack");
  });

  it("does not write metrics for another tenant's connection", async () => {
    const id = await connectionWithScope();
    const [message] = (await enqueueDueSyncs(h.testDb.db)).filter((row) => row.connectionId === id);
    const foreign: SyncMessage = { ...message!, tenantId: crypto.randomUUID() };
    expect(await consumeSyncMessage(h.testDb.db, foreign, new Map([["mock", new MockConnector()]]))).toBe("ack");
    const values = await h.testDb.db.select().from(metricValues).where(eq(metricValues.connectionId, id));
    expect(values).toHaveLength(0);
  });
});
