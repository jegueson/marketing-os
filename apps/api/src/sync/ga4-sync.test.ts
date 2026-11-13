import { afterEach, describe, expect, it } from "vitest";
import { Ga4Connector, SANDBOX_PROPERTY, recordedGa4Fetch } from "@marketing-os/connector-google-analytics";
import { MockConnector } from "@marketing-os/connector-mock";
import { openKeyRing } from "@marketing-os/core";
import { metricValues, withContext } from "@marketing-os/db";
import { eq } from "drizzle-orm";
import { saveConnectionCredentials } from "../lib/credentials";
import { createHarness, provisionCustomer, type Harness, type ProvisionedCustomer, type TestUser } from "../testing/harness";
import { consumeSyncMessage, enqueueDueSyncs, type SyncMessage } from "./engine";

const DATA_KEY = btoa("0123456789abcdef0123456789abcdef");
const CLIENT_SECRET = "ga4-client-secret";

describe("GA4 sandbox sync", () => {
  let h: Harness;
  const queued: SyncMessage[] = [];

  afterEach(() => h.close());

  async function setup(env: Partial<Env> = {}): Promise<{ sm: TestUser; acme: ProvisionedCustomer; base: string }> {
    queued.length = 0;
    h = await createHarness(
      {
        connectors: new Map<string, MockConnector | Ga4Connector>([
          ["mock", new MockConnector()],
          ["google-analytics", new Ga4Connector({ fetch: recordedGa4Fetch() })],
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
    return { sm, acme, base: `/api/v1/workspaces/${acme.workspaceId}` };
  }

  it("stays hidden until the feature flag is on", async () => {
    const { acme, base } = await setup();
    const catalog = await h.call<{ slug: string; status: string }[]>(`${base}/integrations`, { token: acme.admin.token });
    expect(catalog.body.data.find((entry) => entry.slug === "google-analytics")?.status).toBe("coming_soon");
    const blocked = await h.call(`${base}/connections`, {
      method: "POST",
      body: { connectorSlug: "google-analytics", displayName: "GA4" },
      token: acme.admin.token,
    });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error?.code).toBe("validation_error");
  });

  it("refuses OAuth start when the Google client is not configured", async () => {
    const { acme, base } = await setup();
    await h.testDb.pg.query("update feature_flags set is_enabled = true where key = 'connector.google-analytics'");
    const created = await h.call<{ id: string }>(`${base}/connections`, {
      method: "POST",
      body: { connectorSlug: "google-analytics", displayName: "GA4" },
      token: acme.admin.token,
    });
    const started = await h.call(`${base}/connections/${created.body.data.id}/oauth/start`, {
      method: "POST",
      token: acme.admin.token,
    });
    expect(started.status).toBe(422);
    expect(started.body.error?.message).toMatch(/not configured/i);
    expect(JSON.stringify(started.body)).not.toContain("refresh_token");
  });

  it("syncs a sandbox property into metric values and does not schedule it again the same day", async () => {
    const { acme, base } = await setup({
      GOOGLE_OAUTH_CLIENT_ID: "ga4-client",
      GOOGLE_OAUTH_CLIENT_SECRET: CLIENT_SECRET,
    });
    await h.testDb.pg.query("update feature_flags set is_enabled = true where key = 'connector.google-analytics'");
    const created = await h.call<{ id: string }>(`${base}/connections`, {
      method: "POST",
      body: { connectorSlug: "google-analytics", displayName: "GA4" },
      token: acme.admin.token,
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    const catalog = await h.call<{ slug: string; status: string }[]>(`${base}/integrations`, { token: acme.admin.token });
    expect(catalog.body.data.find((entry) => entry.slug === "google-analytics")?.status).toBe("available");

    const started = await h.call<{ authorizationUrl: string }>(`${base}/connections/${id}/oauth/start`, {
      method: "POST",
      token: acme.admin.token,
    });
    expect(started.status).toBe(200);
    expect(started.body.data.authorizationUrl).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(started.body.data.authorizationUrl).toContain("analytics.readonly");
    expect(started.body.data.authorizationUrl).toContain("access_type=offline");
    expect(started.body.data.authorizationUrl).not.toContain(CLIENT_SECRET);
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
      body: { resources: [{ resourceType: "property", resourceId: SANDBOX_PROPERTY, resourceName: "Sandbox property" }] },
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
          new Map([["google-analytics", new Ga4Connector({ fetch: recordedGa4Fetch() })]]),
          ring,
        ),
      ).toBe("ack");
    }

    const values = await h.testDb.db.select().from(metricValues).where(eq(metricValues.connectionId, id));
    const sessions = values.filter((row) => row.definitionKey === "ga4.sessions");
    const keyEvents = values.filter((row) => row.definitionKey === "ga4.key_events");
    expect(sessions).toHaveLength(3);
    expect(keyEvents).toHaveLength(3);
    expect(sessions.every((row) => Number(row.value) === 120 && row.definitionVersion === "1")).toBe(true);
    expect(keyEvents.every((row) => Number(row.value) === 4 && row.definitionVersion === "1")).toBe(true);
    const { rows } = await h.testDb.pg.query<{ ciphertext: string }>(
      "select ciphertext from credential_references where connection_id = $1",
      [id],
    );
    expect(rows[0]?.ciphertext).not.toContain("sandbox-token");
    const again = await enqueueDueSyncs(h.testDb.db);
    expect(again.filter((message) => message.connectionId === id)).toEqual([]);
  });
});
