import { afterEach, describe, expect, it } from "vitest";
import type { Connector } from "@marketing-os/connector-sdk";
import { ADS_CLIENT, GoogleAdsConnector, recordedAdsFetch } from "@marketing-os/connector-google-ads";
import { MockConnector } from "@marketing-os/connector-mock";
import { openKeyRing } from "@marketing-os/core";
import { metricValues, withContext } from "@marketing-os/db";
import { eq } from "drizzle-orm";
import { saveConnectionCredentials } from "../lib/credentials";
import { createHarness, provisionCustomer, type Harness, type ProvisionedCustomer } from "../testing/harness";
import { consumeSyncMessage, enqueueDueSyncs, type SyncMessage } from "./engine";

const DATA_KEY = btoa("0123456789abcdef0123456789abcdef");
const CLIENT_SECRET = "ads-client-secret";
const DEVELOPER_TOKEN = "ads-developer-token";

describe("Google Ads sandbox sync", () => {
  let h: Harness;
  const queued: SyncMessage[] = [];

  afterEach(() => h.close());

  async function setup(env: Partial<Env> = {}): Promise<{ acme: ProvisionedCustomer; base: string }> {
    queued.length = 0;
    h = await createHarness(
      {
        connectors: new Map<string, Connector>([
          ["mock", new MockConnector()],
          ["google-ads", new GoogleAdsConnector({ fetch: recordedAdsFetch() })],
        ]),
        syncQueue: {
          sendBatch: async (messages) => {
            queued.push(...messages);
          },
        },
      },
      "self_hosted",
      { MOS_DATA_KEY: DATA_KEY, ...env },
    );
    const sm = await h.user("sm@example.com", "success_manager");
    const acme = await provisionCustomer(h, sm, "Acme", "owner@acme.test");
    return { acme, base: `/api/v1/workspaces/${acme.workspaceId}` };
  }

  it("stays hidden until the feature flag is on", async () => {
    const { acme, base } = await setup();
    const catalog = await h.call<{ slug: string; status: string }[]>(`${base}/integrations`, { token: acme.admin.token });
    expect(catalog.body.data.find((entry) => entry.slug === "google-ads")?.status).toBe("coming_soon");
    const blocked = await h.call(`${base}/connections`, {
      method: "POST",
      body: { connectorSlug: "google-ads", displayName: "Ads" },
      token: acme.admin.token,
    });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error?.code).toBe("validation_error");
  });

  it("refuses OAuth start when the developer token is missing", async () => {
    const { acme, base } = await setup({ GOOGLE_OAUTH_CLIENT_ID: "ads-client", GOOGLE_OAUTH_CLIENT_SECRET: CLIENT_SECRET });
    await h.testDb.pg.query("update feature_flags set is_enabled = true where key = 'connector.google-ads'");
    const created = await h.call<{ id: string }>(`${base}/connections`, {
      method: "POST",
      body: { connectorSlug: "google-ads", displayName: "Ads" },
      token: acme.admin.token,
    });
    const started = await h.call(`${base}/connections/${created.body.data.id}/oauth/start`, {
      method: "POST",
      token: acme.admin.token,
    });
    expect(started.status).toBe(422);
    expect(started.body.error?.message).toMatch(/developer token/i);
    expect(JSON.stringify(started.body)).not.toContain(CLIENT_SECRET);
  });

  it("syncs a test account into metric values and does not schedule it again the same day", async () => {
    const { acme, base } = await setup({
      GOOGLE_OAUTH_CLIENT_ID: "ads-client",
      GOOGLE_OAUTH_CLIENT_SECRET: CLIENT_SECRET,
      GOOGLE_ADS_DEVELOPER_TOKEN: DEVELOPER_TOKEN,
    });
    await h.testDb.pg.query("update feature_flags set is_enabled = true where key = 'connector.google-ads'");
    const created = await h.call<{ id: string }>(`${base}/connections`, {
      method: "POST",
      body: { connectorSlug: "google-ads", displayName: "Ads" },
      token: acme.admin.token,
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    const catalog = await h.call<{ slug: string; status: string }[]>(`${base}/integrations`, { token: acme.admin.token });
    expect(catalog.body.data.find((entry) => entry.slug === "google-ads")?.status).toBe("available");

    const started = await h.call<{ authorizationUrl: string }>(`${base}/connections/${id}/oauth/start`, {
      method: "POST",
      token: acme.admin.token,
    });
    expect(started.status).toBe(200);
    const authorizationUrl = new URL(started.body.data.authorizationUrl);
    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(authorizationUrl.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/adwords");
    expect(authorizationUrl.searchParams.get("access_type")).toBe("offline");
    expect(started.body.data.authorizationUrl).not.toContain(CLIENT_SECRET);
    expect(started.body.data.authorizationUrl).not.toContain(DEVELOPER_TOKEN);
    expect(JSON.stringify(started.body)).not.toContain("code_verifier");

    const ring = await openKeyRing(1, [{ version: 1, base64: DATA_KEY }]);
    await withContext(h.testDb.db, { tenantId: acme.tenantId, userId: acme.admin.id, staff: false }, (tx) =>
      saveConnectionCredentials(tx, {
        connectionId: id,
        tenantId: acme.tenantId,
        ring,
        credentials: { access_token: "sandbox-token", refresh_token: "sandbox-refresh" },
      }),
    );
    const scoped = await h.call(`${base}/connections/${id}/scopes`, {
      method: "PUT",
      body: { resources: [{ resourceType: "account", resourceId: ADS_CLIENT, resourceName: "Test account" }] },
      token: acme.admin.token,
    });
    expect(scoped.status).toBe(200);
    const sync = await h.call<{ runs: number }>(`${base}/connections/${id}/sync`, { method: "POST", token: acme.admin.token });
    expect(sync.status).toBe(202);
    expect(sync.body.data.runs).toBe(3);
    for (const message of queued) {
      expect(
        await consumeSyncMessage(
          h.testDb.db,
          message,
          new Map([["google-ads", new GoogleAdsConnector({ fetch: recordedAdsFetch() })]]),
          ring,
          DEVELOPER_TOKEN,
        ),
      ).toBe("ack");
    }

    const values = await h.testDb.db.select().from(metricValues).where(eq(metricValues.connectionId, id));
    const spend = values.filter((row) => row.definitionKey === "google_ads.spend");
    const conversions = values.filter((row) => row.definitionKey === "google_ads.conversions");
    expect(spend).toHaveLength(3);
    expect(conversions).toHaveLength(3);
    expect(spend.every((row) => Number(row.value) === 85.5 && row.definitionVersion === "1")).toBe(true);
    expect(conversions.every((row) => Number(row.value) === 12 && row.definitionVersion === "1")).toBe(true);
    const { rows } = await h.testDb.pg.query<{ ciphertext: string }>(
      "select ciphertext from credential_references where connection_id = $1",
      [id],
    );
    expect(rows[0]?.ciphertext).not.toContain("sandbox-token");
    expect(rows[0]?.ciphertext).not.toContain(DEVELOPER_TOKEN);
    const again = await enqueueDueSyncs(h.testDb.db);
    expect(again.filter((message) => message.connectionId === id)).toEqual([]);
  });
});
