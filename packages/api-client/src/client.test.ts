import { describe, expect, it, vi } from "vitest";
import { createApiClient, createApiClientFromOptions } from "./index";

describe("api-client", () => {
  it("calls healthz through the options helper", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        success: true,
        data: { status: "ok" },
        error: null,
        meta: null,
      }),
    );
    const client = createApiClientFromOptions({
      baseUrl: "http://example.test",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await client.healthz();
    expect(res.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://example.test/healthz",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("sends the bearer token and JSON body", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ success: true, data: 1, error: null, meta: null }),
    );
    const api = createApiClient(
      async () => "tok",
      "http://api",
      fetchImpl as unknown as typeof fetch,
    );
    const res = await api<number>("/x", { method: "POST", body: { a: 1 } });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data).toBe(1);
    expect(fetchImpl).toHaveBeenCalledWith("http://api/x", {
      method: "POST",
      headers: { authorization: "Bearer tok", "content-type": "application/json" },
      body: '{"a":1}',
    });
  });

  it("turns network failures into an error envelope", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const api = createApiClient(
      async () => null,
      "http://api",
      (async () => {
        throw new TypeError("offline");
      }) as typeof fetch,
    );
    const res = await api("/x");
    expect(res).toMatchObject({ success: false, error: { code: "network_error" } });
  });

  it("turns non-JSON responses into an error envelope", async () => {
    const api = createApiClient(
      async () => null,
      "http://api",
      (async () => new Response("<html>", { status: 502 })) as typeof fetch,
    );
    expect((await api("/x")).error?.code).toBe("bad_response");
  });

  it("turns malformed JSON envelopes into bad_response", async () => {
    const api = createApiClient(
      async () => null,
      "http://api",
      (async () => Response.json({ ok: true })) as typeof fetch,
    );
    expect((await api("/x")).error?.code).toBe("bad_response");
  });
});
