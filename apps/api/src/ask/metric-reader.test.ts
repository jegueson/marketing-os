import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockConnector } from "@marketing-os/connector-mock";
import { metricDefinitions, metricValues, withReadOnly } from "@marketing-os/db";
import { loadMetricsYaml } from "@marketing-os/metrics";
import { createHarness, provisionCustomer, type Harness, type ProvisionedCustomer, type TestUser } from "../testing/harness";
import { consumeSyncMessage, enqueueDueSyncs } from "../sync/engine";
import { createDrizzleMetricReader } from "./drizzle-metric-reader";

const now = new Date("2026-04-01T15:00:00.000Z");

describe("metric reader", () => {
  let h: Harness;
  let sm: TestUser;
  let acme: ProvisionedCustomer;
  let base: string;

  beforeAll(async () => {
    h = await createHarness();
    sm = await h.user("sm@example.com", "success_manager");
    acme = await provisionCustomer(h, sm, "Acme", "owner@acme.test");
    base = `/api/v1/workspaces/${acme.workspaceId}`;
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
    const messages = (await enqueueDueSyncs(h.testDb.db, now)).filter((message) => message.connectionId === id);
    const connectors = new Map([["mock", new MockConnector()]]);
    for (const message of messages) {
      expect(await consumeSyncMessage(h.testDb.db, message, connectors)).toBe("ack");
    }
    const catalog = loadMetricsYaml(
      join(dirname(fileURLToPath(import.meta.url)), "../../../../customer-configs/_templates/metrics.yaml"),
    );
    await h.testDb.db.insert(metricDefinitions).values(
      catalog.definitions.map((definition) => ({
        key: definition.key,
        source: definition.source,
        version: definition.version,
        label: definition.label,
        unit: definition.unit ?? null,
        formula: definition.formula ?? null,
        target: definition.target == null ? null : String(definition.target),
        widgets: definition.widgets ?? [],
      })),
    );
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  it("matches the cockpit Spend fixture and returns lineage", async () => {
    const reader = createDrizzleMetricReader(h.testDb.db, {
      tenantId: acme.tenantId,
      workspaceId: acme.workspaceId,
      now,
    });
    const observed = await reader.metricValue({ metricKey: "Spend", range: "last_30_days" });
    const cockpit = await h.call<{
      widgets: { executive: { key: string; value: number; definitionVersion: string | null }[] };
    }>(`${base}/cockpit`, { token: acme.admin.token });
    const spend = cockpit.body.data.widgets.executive.find((card) => card.key === "Spend");
    expect(spend?.value).toBe(85 * 30);
    expect(observed.value).toBe(spend?.value);
    expect(observed).toMatchObject({
      status: "ok",
      source: "mock",
      definitionVersion: "1",
      scopes: ["mock-account-1"],
    });
    expect(observed.fetchedAt).toEqual(expect.any(String));
    expect(observed.windows).toEqual([
      { start: "2026-03-02T00:00:00.000Z", end: "2026-04-01T00:00:00.000Z" },
    ]);

    const compared = await reader.metricCompare({ metricKey: "Spend", range: "last_30_days" });
    expect(compared).toMatchObject({ current: 85 * 30, previous: 85 * 30, delta: 0, definitionVersion: "1" });
    const health = await reader.dataHealth();
    expect(health[0]).toMatchObject({ connector: "mock", health: "healthy", scopes: ["mock-account-1"] });
  });

  it("keeps tenant definition overrides isolated", async () => {
    const globex = await provisionCustomer(h, sm, "Globex", "owner@globex.test");
    await h.testDb.db.insert(metricDefinitions).values([
      {
        tenantId: acme.tenantId,
        key: "Spend",
        source: "formula",
        version: "2",
        label: "Acme spend",
        unit: "currency",
        formula: { op: "sum", metric: "mock.spend" },
        widgets: ["executive"],
      },
      {
        tenantId: globex.tenantId,
        key: "Spend",
        source: "formula",
        version: "3",
        label: "Globex spend",
        unit: "currency",
        formula: { op: "sum", metric: "mock.spend" },
        widgets: ["executive"],
      },
    ]);
    const acmeReader = createDrizzleMetricReader(h.testDb.db, {
      tenantId: acme.tenantId,
      workspaceId: acme.workspaceId,
      now,
    });
    const globexReader = createDrizzleMetricReader(h.testDb.db, {
      tenantId: globex.tenantId,
      workspaceId: globex.workspaceId,
      now,
    });
    const acmeSpend = (await acmeReader.listMetrics()).find((metric) => metric.key === "Spend");
    const globexSpend = (await globexReader.listMetrics()).find((metric) => metric.key === "Spend");
    expect(acmeSpend).toMatchObject({ label: "Acme spend", version: "2" });
    expect(globexSpend).toMatchObject({ label: "Globex spend", version: "3" });
    expect((await acmeReader.listMetrics()).some((metric) => metric.label === "Globex spend")).toBe(false);
  });

  it("returns no data for another tenant's metric", async () => {
    const globex = await provisionCustomer(h, sm, "Globex Only", "owner@globex-only.test");
    const created = await h.call<{ id: string }>(`/api/v1/workspaces/${globex.workspaceId}/connections`, {
      method: "POST",
      body: { connectorSlug: "mock", displayName: "Globex mock" },
      token: globex.admin.token,
    });
    await h.testDb.db.insert(metricValues).values({
      tenantId: globex.tenantId,
      definitionKey: "globex.only",
      definitionVersion: "1",
      periodStart: new Date("2026-03-02T00:00:00.000Z"),
      periodEnd: new Date("2026-04-01T00:00:00.000Z"),
      dimensionHash: "globex-account",
      connectionId: created.body.data.id,
      value: "999999",
      fetchedAt: now,
    });
    const acmeReader = createDrizzleMetricReader(h.testDb.db, {
      tenantId: acme.tenantId,
      workspaceId: acme.workspaceId,
      now,
    });
    const hidden = await acmeReader.metricValue({ metricKey: "globex.only", range: "last_30_days" });
    expect(hidden).toMatchObject({ status: "no_data", value: null });
    const globexReader = createDrizzleMetricReader(h.testDb.db, {
      tenantId: globex.tenantId,
      workspaceId: globex.workspaceId,
      now,
    });
    await h.testDb.db.insert(metricDefinitions).values({
      tenantId: globex.tenantId,
      key: "globex.only",
      source: "globex",
      version: "1",
      label: "Globex only",
      widgets: [],
    });
    const visible = await globexReader.metricValue({ metricKey: "globex.only", range: "last_30_days" });
    expect(visible).toMatchObject({ status: "ok", value: 999999, source: "globex", definitionVersion: "1" });
  });

  it("rejects a write inside the reader transaction", async () => {
    await expect(
      withReadOnly(h.testDb.db, { tenantId: acme.tenantId, userId: null, staff: false }, (tx) =>
        tx.insert(metricDefinitions).values({
          tenantId: acme.tenantId,
          key: "blocked.write",
          source: "mock",
          version: "1",
          label: "Blocked",
          widgets: [],
        }),
      ),
    ).rejects.toSatisfy((err: unknown) => /read-only|read only/i.test(errorText(err)));
  });
});

function errorText(err: unknown): string {
  const parts: string[] = [];
  let current = err;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (typeof current === "object" && current && "message" in current && typeof current.message === "string") {
      parts.push(current.message);
    }
    current = typeof current === "object" && current && "cause" in current ? current.cause : undefined;
  }
  return parts.join("\n");
}
