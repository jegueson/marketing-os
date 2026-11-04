import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./index";

describe("api-client", () => {
  it("calls healthz", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        success: true,
        data: { status: "ok" },
        error: null,
        meta: null,
      }),
    );
    const client = createApiClient({
      baseUrl: "http://example.test",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await client.healthz();
    expect(res.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://example.test/healthz",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });
});
