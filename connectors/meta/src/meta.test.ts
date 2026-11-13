import { describe, expect, it } from "vitest";
import { ConnectorError, runConnectorContract } from "@marketing-os/connector-sdk";
import { META_ACCOUNT, recordedMetaFetch } from "./fixtures";
import { MetaConnector } from "./meta";
import { requestMetaToken } from "./oauth";

const ctx = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  connectionId: "33333333-3333-4333-8333-333333333333",
  credentials: { access_token: "long-lived-token" },
};
const window = { dimensions: [META_ACCOUNT], from: "2026-10-01T00:00:00.000Z", to: "2026-10-31T00:00:00.000Z" };

describe("Meta Ads connector", () => {
  it("passes the contract kit against recorded fixtures", async () => {
    await runConnectorContract(new MetaConnector({ fetch: recordedMetaFetch() }), {
      metric: "meta.spend",
      dimensions: [META_ACCOUNT],
      credentials: ctx.credentials,
    });
  });

  it("lists the test ad account", async () => {
    const resources = await new MetaConnector({ fetch: recordedMetaFetch() }).listResources(ctx);
    expect(resources).toEqual([{ name: META_ACCOUNT, kind: "account", description: "Test ad account" }]);
  });

  it("reads spend and impressions for the selected account", async () => {
    const calls: { url: string; authorization: string }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      calls.push({ url: String(input), authorization: headers.get("authorization") ?? "" });
      return recordedMetaFetch()(input, init);
    };
    const connector = new MetaConnector({ fetch: fetchImpl });
    const spend = await connector.queryMetrics(ctx, { metric: "meta.spend", ...window });
    const impressions = await connector.queryMetrics(ctx, { metric: "meta.impressions", ...window });
    const insight = calls.map((call) => new URL(call.url)).find((url) => url.pathname.endsWith("/insights"));
    expect(insight?.pathname).toBe(`/v26.0/${META_ACCOUNT}/insights`);
    expect(insight?.searchParams.get("fields")).toBe("spend");
    expect(insight?.searchParams.get("time_range")).toBe(JSON.stringify({ since: "2026-10-01", until: "2026-10-30" }));
    expect(insight?.searchParams.has("access_token")).toBe(false);
    expect(calls.every((call) => call.authorization === "Bearer long-lived-token")).toBe(true);
    expect(spend[0]).toMatchObject({ metric: "meta.spend", value: 42.5, unit: "currency", lineage: { source: "meta", definitionVersion: "1" } });
    expect(impressions[0]).toMatchObject({ metric: "meta.impressions", value: 1000, unit: "count" });
  });

  it("follows the next page and drops the access token from the cursor", async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (urls.length === 1) {
        return Response.json({
          data: [],
          paging: { next: "https://graph.facebook.com/v26.0/me/adaccounts?access_token=long-lived-token&after=cursor" },
        });
      }
      return Response.json({ data: [{ id: META_ACCOUNT, name: "Test ad account" }] });
    };
    const resources = await new MetaConnector({ fetch: fetchImpl }).listResources(ctx);
    expect(resources.map((resource) => resource.name)).toEqual([META_ACCOUNT]);
    expect(urls[1]).not.toContain("access_token");
    expect(urls[1]).toContain("after=cursor");
  });

  it("maps auth and rate-limit responses without echoing the token", async () => {
    const secret = "long-lived-token";
    const fetchImpl: typeof fetch = async () => Response.json({ error: { message: secret, type: "OAuthException" } }, { status: 401 });
    const rejected = await new MetaConnector({ fetch: fetchImpl })
      .queryMetrics(ctx, { metric: "meta.spend", ...window })
      .then(() => null, (err: unknown) => err);
    expect(rejected).toMatchObject({ code: "auth_expired" });
    expect(rejected instanceof Error ? rejected.message : "").not.toContain(secret);

    const denied: typeof fetch = async () => new Response("", { status: 403 });
    await expect(new MetaConnector({ fetch: denied }).queryMetrics(ctx, { metric: "meta.spend", ...window })).rejects.toMatchObject({
      code: "permission_changed",
    });

    const limited: typeof fetch = async () => new Response("", { status: 429 });
    const error = await new MetaConnector({ fetch: limited }).queryMetrics(ctx, { metric: "meta.spend", ...window }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error).toMatchObject({ code: "rate_limited", retryable: true });
  });

  it("exchanges the authorization code for a long-lived token without returning the app secret", async () => {
    const secret = "meta-app-secret";
    const bodies: string[] = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = String(init?.body);
      bodies.push(body);
      if (bodies.length === 1) return Response.json({ access_token: "short-lived", expires_in: 3600 });
      return Response.json({ access_token: "long-lived", expires_in: 5_184_000 });
    };
    await expect(
      requestMetaToken({
        fetch: fetchImpl,
        clientId: "app",
        clientSecret: secret,
        code: "auth-code",
        redirectUri: "http://127.0.0.1:8787/api/v1/integrations/oauth/callback",
      }),
    ).resolves.toEqual({ accessToken: "long-lived", refreshToken: "long-lived", expiresIn: 5_184_000 });
    expect(bodies[1]).toContain("grant_type=fb_exchange_token");
    expect(bodies[1]).toContain("fb_exchange_token=short-lived");

    const rejected: typeof fetch = async () => Response.json({ error: { message: secret } }, { status: 400 });
    const failure = await requestMetaToken({
      fetch: rejected,
      clientId: "app",
      clientSecret: secret,
      code: "bad",
      redirectUri: "http://127.0.0.1:8787/api/v1/integrations/oauth/callback",
    }).then(() => null, (err: unknown) => err);
    expect(failure).toMatchObject({ code: "auth_failed" });
    expect(failure instanceof Error ? failure.message : "").not.toContain(secret);
  });
});
