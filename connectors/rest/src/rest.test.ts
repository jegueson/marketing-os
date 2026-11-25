import { describe, expect, it, vi } from "vitest";
import { ConnectorError, runConnectorContract } from "@marketing-os/connector-sdk";
import { assertRestGetMethod, assertSafeRestUrl } from "./endpoint-guard";
import { RestConnector } from "./rest";

const publicBase = "https://metrics.example.com";
const ctxBase = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  connectionId: "33333333-3333-4333-8333-333333333333",
};

function connectorWith(fetchImpl: typeof fetch) {
  return new RestConnector({ fetch: fetchImpl });
}

describe("REST endpoint guard", () => {
  it("blocks loopback and metadata addresses before any socket", () => {
    expect(() => assertSafeRestUrl("http://127.0.0.1/metrics")).toThrow(ConnectorError);
    expect(() => assertSafeRestUrl("https://127.0.0.1/metrics")).toThrow(ConnectorError);
    expect(() => assertSafeRestUrl("http://169.254.169.254/latest")).toThrow(ConnectorError);
    expect(() => assertSafeRestUrl("https://169.254.169.254/latest")).toThrow(ConnectorError);
  });

  it("refuses non-GET before any socket", () => {
    expect(() => assertRestGetMethod("POST")).toThrow(/only allows GET/);
    expect(() => assertRestGetMethod("GET")).not.toThrow();
  });
});

describe("RestConnector SSRF", () => {
  it("http://127.0.0.1 never opens a socket", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const connector = connectorWith(fetchImpl as unknown as typeof fetch);
    await expect(
      connector.queryMetrics(
        { ...ctxBase, credentials: { base_url: "http://127.0.0.1" } },
        {
          metric: "rest.value",
          from: "2026-01-01",
          to: "2026-01-08",
          dimensions: [],
        },
      ),
    ).rejects.toThrow(/https|blocked|invalid/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("http://169.254.169.254 never opens a socket", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const connector = connectorWith(fetchImpl as unknown as typeof fetch);
    await expect(
      connector.queryMetrics(
        { ...ctxBase, credentials: { base_url: "http://169.254.169.254" } },
        {
          metric: "rest.value",
          from: "2026-01-01",
          to: "2026-01-08",
          dimensions: [],
        },
      ),
    ).rejects.toThrow(/https|blocked|invalid/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a non-GET method never opens a socket", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const connector = connectorWith(fetchImpl as unknown as typeof fetch);
    await expect(
      connector.request(
        { ...ctxBase, credentials: { base_url: publicBase } },
        "POST",
        "/metrics/value",
      ),
    ).rejects.toThrow(/only allows GET/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("RestConnector query", () => {
  it("a public HTTPS fixture returns a metric row", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/health")) return new Response(JSON.stringify({ ok: true }));
      return new Response(JSON.stringify({ value: 42, unit: "count" }), {
        headers: { "content-type": "application/json" },
      });
    });
    const connector = connectorWith(fetchImpl as unknown as typeof fetch);
    const rows = await connector.queryMetrics(
      { ...ctxBase, credentials: { base_url: publicBase, bearer_token: "secret" } },
      {
        metric: "rest.value",
        from: "2026-01-01",
        to: "2026-01-08",
        dimensions: [],
      },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      metric: "rest.value",
      value: 42,
      unit: "count",
      lineage: { source: "rest", definitionVersion: "1" },
    });
    expect(fetchImpl).toHaveBeenCalled();
    const firstCall = fetchImpl.mock.calls[0];
    expect(String(firstCall?.[0])).toContain("https://metrics.example.com/metrics/value");
    expect(firstCall?.[1]).toMatchObject({ method: "GET", redirect: "error" });
  });

  it("passes the connector contract kit", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/health")) return new Response(JSON.stringify({ ok: true }));
      return new Response(JSON.stringify({ value: 7, unit: "count" }));
    });
    const connector = connectorWith(fetchImpl as unknown as typeof fetch);
    await expect(
      runConnectorContract(connector, {
        metric: "rest.value",
        credentials: { base_url: publicBase, api_key: "k" },
      }),
    ).resolves.toBeUndefined();
  });
});
