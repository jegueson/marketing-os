import { describe, expect, it } from "vitest";
import { ConnectorError, runConnectorContract } from "@marketing-os/connector-sdk";
import { GoogleAdsConnector } from "./ads";
import { ADS_CLIENT, ADS_MCC, recordedAdsFetch } from "./fixtures";
import { requestGoogleAdsToken } from "./oauth";

const DEVELOPER_TOKEN = "ads-developer-token";
const ctx = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  connectionId: "33333333-3333-4333-8333-333333333333",
  credentials: { access_token: "sandbox-token", developer_token: DEVELOPER_TOKEN },
};
const window = { dimensions: [ADS_CLIENT], from: "2026-10-01T00:00:00.000Z", to: "2026-10-31T00:00:00.000Z" };

describe("Google Ads connector", () => {
  it("passes the contract kit against recorded fixtures", async () => {
    await runConnectorContract(new GoogleAdsConnector({ fetch: recordedAdsFetch() }), {
      metric: "google_ads.spend",
      dimensions: [ADS_CLIENT],
      credentials: ctx.credentials,
    });
  });

  it("lists the test account under its MCC", async () => {
    const resources = await new GoogleAdsConnector({ fetch: recordedAdsFetch() }).listResources(ctx);
    expect(resources.find((resource) => resource.name === ADS_CLIENT)).toMatchObject({
      kind: "account",
      description: "Test account",
      parentId: ADS_MCC,
    });
  });

  it("maps recorded reports onto google_ads catalog metrics", async () => {
    const calls: { url: string; body: string; authorization: string; developerToken: string; loginCustomerId: string }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(input),
        body: typeof init?.body === "string" ? init.body : "",
        authorization: headers.get("authorization") ?? "",
        developerToken: headers.get("developer-token") ?? "",
        loginCustomerId: headers.get("login-customer-id") ?? "",
      });
      return recordedAdsFetch()(input, init);
    };
    const connector = new GoogleAdsConnector({ fetch: fetchImpl });
    const spend = await connector.queryMetrics(ctx, { metric: "google_ads.spend", ...window });
    const conversions = await connector.queryMetrics(ctx, { metric: "google_ads.conversions", ...window });
    const reports = calls.filter((call) => call.url.endsWith("/customers/2222222222/googleAds:search"));
    expect(reports).toHaveLength(2);
    expect(reports[0]?.body).toContain("metrics.cost_micros");
    expect(reports[0]?.body).toContain("BETWEEN '2026-10-01' AND '2026-10-30'");
    expect(reports[1]?.body).toContain("metrics.conversions");
    expect(reports.every((call) => call.authorization === "Bearer sandbox-token")).toBe(true);
    expect(reports.every((call) => call.developerToken === DEVELOPER_TOKEN)).toBe(true);
    expect(reports.every((call) => call.loginCustomerId === "1111111111")).toBe(true);
    expect(spend[0]).toMatchObject({ metric: "google_ads.spend", value: 85.5, lineage: { source: "google_ads", definitionVersion: "1" } });
    expect(conversions[0]?.value).toBe(12);
  });

  it("expands a selected MCC to its client account", async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      urls.push(String(input));
      return recordedAdsFetch()(input, init);
    };
    await new GoogleAdsConnector({ fetch: fetchImpl }).queryMetrics(ctx, { ...window, dimensions: [ADS_MCC], metric: "google_ads.spend" });
    expect(urls.filter((url) => url.endsWith("/customers/2222222222/googleAds:search"))).toHaveLength(1);
  });

  it("refuses to call Google when the developer token is missing", async () => {
    let called = false;
    const fetchImpl: typeof fetch = async () => {
      called = true;
      return new Response("no", { status: 500 });
    };
    await expect(
      new GoogleAdsConnector({ fetch: fetchImpl }).queryMetrics(
        { ...ctx, credentials: { access_token: "sandbox-token" } },
        { metric: "google_ads.spend", ...window },
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(called).toBe(false);
  });

  it("maps auth and rate-limit responses without echoing the token", async () => {
    const fetchImpl: typeof fetch = async () => Response.json({ error: { message: DEVELOPER_TOKEN } }, { status: 401 });
    const rejected = await new GoogleAdsConnector({ fetch: fetchImpl })
      .queryMetrics(ctx, { metric: "google_ads.spend", ...window })
      .then(() => null, (err: unknown) => err);
    expect(rejected).toMatchObject({ code: "auth_expired" });
    expect(rejected instanceof Error ? rejected.message : "").not.toContain(DEVELOPER_TOKEN);

    const denied: typeof fetch = async () => new Response("", { status: 403 });
    await expect(
      new GoogleAdsConnector({ fetch: denied }).queryMetrics(ctx, { metric: "google_ads.spend", ...window }),
    ).rejects.toMatchObject({ code: "permission_changed" });

    const limited: typeof fetch = async () => new Response("", { status: 429 });
    const error = await new GoogleAdsConnector({ fetch: limited })
      .queryMetrics(ctx, { metric: "google_ads.spend", ...window })
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error).toMatchObject({ code: "rate_limited", retryable: true });
  });

  it("exchanges a recorded authorization code without returning the client secret", async () => {
    const secret = "client-secret-value";
    const fetchImpl: typeof fetch = async () => Response.json({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600 });
    await expect(
      requestGoogleAdsToken({
        fetch: fetchImpl,
        clientId: "client",
        clientSecret: secret,
        code: "auth-code",
        codeVerifier: "verifier-verifier-verifier-verifier-verifier",
        redirectUri: "http://127.0.0.1:8787/api/v1/integrations/oauth/callback",
      }),
    ).resolves.toEqual({ accessToken: "access-1", refreshToken: "refresh-1", expiresIn: 3600 });

    const rejected: typeof fetch = async () => Response.json({ error: secret }, { status: 400 });
    const failure = await requestGoogleAdsToken({
      fetch: rejected,
      clientId: "client",
      clientSecret: secret,
      code: "bad",
      codeVerifier: "verifier-verifier-verifier-verifier-verifier",
      redirectUri: "http://127.0.0.1:8787/api/v1/integrations/oauth/callback",
    }).then(() => null, (err: unknown) => err);
    expect(failure).toMatchObject({ code: "auth_failed" });
    expect(failure instanceof Error ? failure.message : "").not.toContain(secret);
  });
});
