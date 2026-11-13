import { describe, expect, it } from "vitest";
import { ConnectorError, runConnectorContract } from "@marketing-os/connector-sdk";
import { Ga4Connector } from "./ga4";
import { SANDBOX_PROPERTY, keyEventsReportFixture, recordedGa4Fetch, sessionsReportFixture } from "./fixtures";
import { requestGa4Token } from "./oauth";

const ctx = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  connectionId: "33333333-3333-4333-8333-333333333333",
  credentials: { access_token: "sandbox-token" },
};
const window = { dimensions: [SANDBOX_PROPERTY], from: "2026-10-01T00:00:00.000Z", to: "2026-10-31T00:00:00.000Z" };

describe("GA4 connector", () => {
  it("passes the contract kit against recorded fixtures", async () => {
    await runConnectorContract(new Ga4Connector({ fetch: recordedGa4Fetch() }), {
      metric: "ga4.sessions",
      dimensions: [SANDBOX_PROPERTY],
      credentials: ctx.credentials,
    });
  });

  it("lists properties under their account", async () => {
    const resources = await new Ga4Connector({ fetch: recordedGa4Fetch() }).listResources(ctx);
    const property = resources.find((resource) => resource.kind === "property");
    expect(property).toMatchObject({ name: SANDBOX_PROPERTY, parentId: "accounts/100", description: "Sandbox property" });
  });

  it("maps recorded reports onto ga4 catalog metrics", async () => {
    const calls: { url: string; body: string; authorization: string }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(input),
        body: typeof init?.body === "string" ? init.body : "",
        authorization: headers.get("authorization") ?? "",
      });
      return recordedGa4Fetch()(input, init);
    };
    const connector = new Ga4Connector({ fetch: fetchImpl });
    const sessions = await connector.queryMetrics(ctx, { metric: "ga4.sessions", ...window });
    const keyEvents = await connector.queryMetrics(ctx, { metric: "ga4.key_events", ...window });
    expect(calls.map((call) => call.url)).toEqual([
      "https://analyticsdata.googleapis.com/v1beta/properties/456:runReport",
      "https://analyticsdata.googleapis.com/v1beta/properties/456:runReport",
    ]);
    expect(calls[0]?.body).toContain('"name":"sessions"');
    expect(calls[0]?.body).toContain('"startDate":"2026-10-01"');
    expect(calls[0]?.body).toContain('"endDate":"2026-10-30"');
    expect(calls[1]?.body).toContain('"name":"keyEvents"');
    expect(calls.every((call) => call.authorization === "Bearer sandbox-token")).toBe(true);
    expect(sessions[0]).toMatchObject({
      metric: "ga4.sessions",
      value: Number(sessionsReportFixture.rows[0]?.metricValues[0]?.value),
      lineage: { source: "ga4", definitionVersion: "1" },
    });
    expect(keyEvents[0]?.value).toBe(Number(keyEventsReportFixture.rows[0]?.metricValues[0]?.value));
    expect(sessions[0]?.lineage.fetchedAt).toEqual(expect.any(String));
  });

  it("follows an account-summary page token", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("pageToken") === "page-2") {
        return Response.json({
          accountSummaries: [
            {
              account: "accounts/200",
              displayName: "Second",
              propertySummaries: [{ property: "properties/789", displayName: "Second property" }],
            },
          ],
        });
      }
      return Response.json({
        accountSummaries: [{ account: "accounts/100", displayName: "First", propertySummaries: [] }],
        nextPageToken: "page-2",
      });
    };
    const resources = await new Ga4Connector({ fetch: fetchImpl }).listResources(ctx);
    expect(resources.map((resource) => resource.name)).toEqual(["accounts/100", "accounts/200", "properties/789"]);
  });

  it("maps auth and rate-limit responses without echoing the token", async () => {
    const secret = "sandbox-token";
    const fetchImpl: typeof fetch = async () => Response.json({ error: { message: secret } }, { status: 401 });
    const rejected = await new Ga4Connector({ fetch: fetchImpl })
      .queryMetrics(ctx, { metric: "ga4.sessions", ...window })
      .then(() => null, (err: unknown) => err);
    expect(rejected).toMatchObject({ code: "auth_expired" });
    expect(rejected instanceof Error ? rejected.message : "").not.toContain(secret);

    const denied: typeof fetch = async () => new Response("", { status: 403 });
    await expect(
      new Ga4Connector({ fetch: denied }).queryMetrics(ctx, { metric: "ga4.sessions", ...window }),
    ).rejects.toMatchObject({ code: "permission_changed" });

    const limited: typeof fetch = async () => new Response("", { status: 429 });
    const error = await new Ga4Connector({ fetch: limited })
      .queryMetrics(ctx, { metric: "ga4.sessions", ...window })
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error).toMatchObject({ code: "rate_limited", retryable: true });
  });

  it("refuses a query that has no property selected", async () => {
    await expect(
      new Ga4Connector({ fetch: recordedGa4Fetch() }).queryMetrics(ctx, { ...window, dimensions: [], metric: "ga4.sessions" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("exchanges a recorded authorization code without returning the client secret", async () => {
    const secret = "client-secret-value";
    let sent = "";
    const fetchImpl: typeof fetch = async (_input, init) => {
      sent = String(init?.body);
      return Response.json({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600 });
    };
    const tokens = await requestGa4Token({
      fetch: fetchImpl,
      clientId: "client",
      clientSecret: secret,
      code: "auth-code",
      codeVerifier: "verifier-verifier-verifier-verifier-verifier",
      redirectUri: "http://127.0.0.1:8787/api/v1/integrations/oauth/callback",
    });
    expect(tokens).toEqual({ accessToken: "access-1", refreshToken: "refresh-1", expiresIn: 3600 });
    expect(sent).toContain("code_verifier=");
    expect(sent).not.toContain("sandbox-token");

    const rejected: typeof fetch = async () => Response.json({ error: secret }, { status: 400 });
    const failure = await requestGa4Token({
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
