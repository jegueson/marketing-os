import { describe, expect, it } from "vitest";
import { ConnectorError, runConnectorContract } from "@marketing-os/connector-sdk";
import { HUBSPOT_PORTAL, recordedHubSpotFetch } from "./fixtures";
import { HubSpotConnector, QUALIFIED_DEAL_STAGES } from "./hubspot";
import { requestHubSpotToken } from "./oauth";

const ctx = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  connectionId: "33333333-3333-4333-8333-333333333333",
  credentials: { access_token: "sandbox-token" },
};
const window = { dimensions: [HUBSPOT_PORTAL], from: "2026-10-01T00:00:00.000Z", to: "2026-10-31T00:00:00.000Z" };

describe("HubSpot connector", () => {
  it("passes the contract kit against recorded fixtures", async () => {
    await runConnectorContract(new HubSpotConnector({ fetch: recordedHubSpotFetch() }), {
      metric: "hubspot.contacts_created",
      dimensions: [HUBSPOT_PORTAL],
      credentials: ctx.credentials,
    });
  });

  it("lists the sandbox portal", async () => {
    const resources = await new HubSpotConnector({ fetch: recordedHubSpotFetch() }).listResources(ctx);
    expect(resources).toEqual([{ name: HUBSPOT_PORTAL, kind: "account", description: "Sandbox portal" }]);
  });

  it("counts contacts created in the window", async () => {
    const calls: { url: string; body: string; authorization: string }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(input),
        body: typeof init?.body === "string" ? init.body : "",
        authorization: headers.get("authorization") ?? "",
      });
      return recordedHubSpotFetch()(input, init);
    };
    const contacts = await new HubSpotConnector({ fetch: fetchImpl }).queryMetrics(ctx, { metric: "hubspot.contacts_created", ...window });
    const search = calls.find((call) => call.url.endsWith("/contacts/search"));
    expect(search?.url).toBe("https://api.hubapi.com/crm/objects/2026-09-beta/contacts/search");
    expect(search?.authorization).toBe("Bearer sandbox-token");
    expect(search?.body).toContain(String(Date.parse(window.from)));
    expect(search?.body).toContain(String(Date.parse(window.to) - 1));
    expect(search?.body).not.toContain("dealstage");
    expect(contacts[0]).toMatchObject({ metric: "hubspot.contacts_created", value: 4, lineage: { source: "hubspot", definitionVersion: "1" } });
  });

  it("counts only qualified deal stages", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push(typeof init?.body === "string" ? init.body : "");
      return recordedHubSpotFetch()(input, init);
    };
    const deals = await new HubSpotConnector({ fetch: fetchImpl }).queryMetrics(ctx, { metric: "hubspot.deals_qualified", ...window });
    const body = calls.find((call) => call.includes("dealstage")) ?? "";
    for (const stage of QUALIFIED_DEAL_STAGES) expect(body).toContain(stage);
    expect(body).not.toContain("appointmentscheduled");
    expect(body).not.toContain("closedlost");
    expect(deals[0]).toMatchObject({ metric: "hubspot.deals_qualified", value: 1, unit: "count" });
  });

  it("refuses a portal the token cannot read", async () => {
    await expect(
      new HubSpotConnector({ fetch: recordedHubSpotFetch() }).queryMetrics(ctx, { ...window, dimensions: ["portals/999"], metric: "hubspot.contacts_created" }),
    ).rejects.toMatchObject({ code: "permission_changed" });
  });

  it("maps auth and rate-limit responses without echoing the token", async () => {
    const secret = "sandbox-token";
    const fetchImpl: typeof fetch = async () => Response.json({ message: secret }, { status: 401 });
    const rejected = await new HubSpotConnector({ fetch: fetchImpl })
      .queryMetrics(ctx, { metric: "hubspot.contacts_created", ...window })
      .then(() => null, (err: unknown) => err);
    expect(rejected).toMatchObject({ code: "auth_expired" });
    expect(rejected instanceof Error ? rejected.message : "").not.toContain(secret);

    const denied: typeof fetch = async () => new Response("", { status: 403 });
    await expect(
      new HubSpotConnector({ fetch: denied }).queryMetrics(ctx, { metric: "hubspot.contacts_created", ...window }),
    ).rejects.toMatchObject({ code: "permission_changed" });

    const limited: typeof fetch = async () => new Response("", { status: 429 });
    const error = await new HubSpotConnector({ fetch: limited })
      .queryMetrics(ctx, { metric: "hubspot.contacts_created", ...window })
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error).toMatchObject({ code: "rate_limited", retryable: true });
  });

  it("exchanges a recorded authorization code without returning the client secret", async () => {
    const secret = "hubspot-client-secret";
    const fetchImpl: typeof fetch = async () => Response.json({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 1800 });
    await expect(
      requestHubSpotToken({
        fetch: fetchImpl,
        clientId: "client",
        clientSecret: secret,
        code: "auth-code",
        codeVerifier: "verifier-verifier-verifier-verifier-verifier",
        redirectUri: "http://127.0.0.1:8787/api/v1/integrations/oauth/callback",
      }),
    ).resolves.toEqual({ accessToken: "access-1", refreshToken: "refresh-1", expiresIn: 1800 });

    const rejected: typeof fetch = async () => Response.json({ message: secret }, { status: 400 });
    const failure = await requestHubSpotToken({
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
