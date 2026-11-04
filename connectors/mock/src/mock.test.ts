import { describe, expect, it } from "vitest";
import { runConnectorContract } from "@marketing-os/connector-sdk";
import { MockConnector } from "./index";

describe("mock connector", () => {
  it("passes the contract kit", async () => {
    await runConnectorContract(new MockConnector());
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
