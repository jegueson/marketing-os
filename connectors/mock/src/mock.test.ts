import { describe, expect, it } from "vitest";
import { runConnectorContract } from "@marketing-os/connector-sdk";
import { MockConnector } from "./index";

describe("mock connector", () => {
  it("passes the contract kit", async () => {
    await runConnectorContract(new MockConnector());
  });

  const ctx = { tenantId: "t", workspaceId: "w", connectionId: "c", credentials: {} };
  const window = { dimensions: [], from: "2026-10-01T00:00:00.000Z", to: "2026-10-31T00:00:00.000Z" };

  it("lists selectable accounts as resources", async () => {
    const resources = await new MockConnector().listResources(ctx);
    const accounts = resources.filter((r) => r.kind === "account");
    expect(accounts.map((a) => a.name)).toEqual(["mock-account-1", "mock-account-2"]);
  });

  it("returns deterministic campaign metrics", async () => {
    const connector = new MockConnector();
    for (const metric of ["spend", "sessions", "conversions", "leads", "impressions"]) {
      const first = await connector.queryMetrics(ctx, { metric, ...window });
      const second = await connector.queryMetrics(ctx, { metric, ...window });
      expect(first[0]?.value).toBeGreaterThan(0);
      expect(second[0]?.value).toBe(first[0]?.value);
    }
  });

  it("returns namespaced metrics with lineage", async () => {
    const connector = new MockConnector();
    const namespaced = await connector.queryMetrics(ctx, { metric: "mock.spend", ...window });
    const plain = await connector.queryMetrics(ctx, { metric: "spend", ...window });
    expect(namespaced[0]).toMatchObject({
      metric: "mock.spend",
      value: plain[0]?.value,
      lineage: { source: "mock", definitionVersion: "1" },
    });
    expect(namespaced[0]?.lineage.fetchedAt).toEqual(expect.any(String));
  });

  it("rejects unknown metrics with a typed error", async () => {
    await expect(
      new MockConnector().queryMetrics(ctx, { metric: "nope", ...window }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("supports injected failure modes", async () => {
    const connector = new MockConnector();
    const unhealthy = await connector.health({
      tenantId: "t",
      workspaceId: "w",
      connectionId: "c",
      credentials: { unhealthy: "1" },
    });
    expect(unhealthy.status).toBe("error");

    await expect(
      connector.queryMetrics(
        {
          tenantId: "t",
          workspaceId: "w",
          connectionId: "c",
          credentials: { fail: "1" },
        },
        {
          metric: "impressions",
          dimensions: [],
          from: new Date(0).toISOString(),
          to: new Date().toISOString(),
        },
      ),
    ).rejects.toThrow(/Injected failure/);
  });
});
