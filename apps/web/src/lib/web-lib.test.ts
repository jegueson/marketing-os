import { describe, expect, it, vi } from "vitest";
import nextConfig from "../../next.config";
import { createApiClient } from "./api";
import { nextLeadStatuses, pickWorkspace, safeNext, type Membership } from "./workspace";

const memberships: Membership[] = [
  {
    tenantId: "t1",
    tenantName: "Acme",
    role: "customer_admin",
    workspaceId: "w1",
    workspaceName: "Default",
  },
  {
    tenantId: "t2",
    tenantName: "Globex",
    role: "customer_user",
    workspaceId: "w2",
    workspaceName: "Default",
  },
];

describe("api client", () => {
  it("sends the bearer token and JSON body", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ success: true, data: 1, error: null, meta: null })),
    );
    const api = createApiClient(
      async () => "tok",
      "http://api",
      fetchImpl as unknown as typeof fetch,
    );
    const res = await api<number>("/x", { method: "POST", body: { a: 1 } });
    expect(res.data).toBe(1);
    expect(fetchImpl).toHaveBeenCalledWith("http://api/x", {
      method: "POST",
      headers: { authorization: "Bearer tok", "content-type": "application/json" },
      body: '{"a":1}',
    });
  });

  it("turns network failures into an error envelope", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const api = createApiClient(async () => null, "http://api", (async () => {
      throw new TypeError("offline");
    }) as typeof fetch);
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
});

describe("workspace helpers", () => {
  it("picks the requested workspace only when the user belongs to it", () => {
    expect(pickWorkspace(memberships, "w2")?.tenantName).toBe("Globex");
    expect(pickWorkspace(memberships, "w-other")?.tenantName).toBe("Acme");
    expect(pickWorkspace([], null)).toBeNull();
  });

  it("offers only legal non-conversion lead moves", () => {
    expect(nextLeadStatuses("new")).toEqual(["contacted", "disqualified", "archived"]);
    expect(nextLeadStatuses("qualified")).toEqual(["disqualified", "archived"]);
    expect(nextLeadStatuses("converted")).toEqual([]);
    expect(nextLeadStatuses("bogus")).toEqual([]);
  });

  it("accepts only same-origin relative redirects", () => {
    expect(safeNext("/invite/abc")).toBe("/invite/abc");
    expect(safeNext("//evil.test")).toBeNull();
    expect(safeNext("https://evil.test")).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
});

describe("security headers", () => {
  it("applies anti-framing and nosniff headers to every route", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const all = rules.find((r) => r.source === "/:path*");
    const values = Object.fromEntries((all?.headers ?? []).map((h) => [h.key, h.value]));
    expect(values["X-Frame-Options"]).toBe("DENY");
    expect(values["X-Content-Type-Options"]).toBe("nosniff");
    expect(values["Strict-Transport-Security"]).toContain("max-age=");
  });
});
