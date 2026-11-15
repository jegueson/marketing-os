import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeGateway, ModelGatewayError } from "@marketing-os/model-gateway";
import {
  createHarness,
  provisionCustomer,
  type Harness,
  type ProvisionedCustomer,
  type TestUser,
} from "../testing/harness";

const DATA_KEY = btoa("0123456789abcdef0123456789abcdef");
const API_KEY = "sk-or-v1-fixture-settings-key";

describe("model settings API", () => {
  let h: Harness;
  let sm: TestUser;
  let acme: ProvisionedCustomer;
  let base: string;
  let fake: FakeGateway;

  beforeEach(async () => {
    fake = new FakeGateway({
      models: [
        {
          id: "openai/gpt-4o-mini",
          displayName: "GPT-4o mini",
          provider: "openrouter",
          inputPriceMicroUsdPer1M: 150_000,
          outputPriceMicroUsdPer1M: 600_000,
        },
      ],
    });
    h = await createHarness(
      {
        createModelGateway: () => fake,
      },
      "self_hosted",
      { MOS_DATA_KEY: DATA_KEY },
    );
    sm = await h.user("sm@example.com", "success_manager");
    acme = await provisionCustomer(h, sm, "Acme", "owner@acme.test");
    base = `/api/v1/workspaces/${acme.workspaceId}/models`;
  });
  afterEach(() => h.close());

  it("returns empty settings when nothing is configured", async () => {
    const res = await h.call<{
      configured: boolean;
      provider: string | null;
      fingerprint: string | null;
    }>(`${base}/settings`, { token: acme.admin.token });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      configured: false,
      provider: null,
      baseUrl: null,
      defaultModel: null,
      fingerprint: null,
    });
  });

  it("saves settings and returns fingerprint without the API key", async () => {
    const saved = await h.call<{
      configured: boolean;
      provider: string;
      fingerprint: string;
      apiKey?: string;
    }>(`${base}/settings`, {
      method: "PUT",
      token: acme.admin.token,
      body: {
        provider: "openrouter",
        apiKey: API_KEY,
        defaultModel: "openai/gpt-4o-mini",
      },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data.configured).toBe(true);
    expect(saved.body.data.provider).toBe("openrouter");
    expect(saved.body.data.fingerprint).toHaveLength(12);
    expect(JSON.stringify(saved.body)).not.toContain(API_KEY);
    expect(saved.body.data.apiKey).toBeUndefined();

    const got = await h.call<Record<string, unknown>>(`${base}/settings`, { token: acme.admin.token });
    expect(got.body.data).toMatchObject({
      configured: true,
      provider: "openrouter",
      defaultModel: "openai/gpt-4o-mini",
      fingerprint: saved.body.data.fingerprint,
    });
    expect(JSON.stringify(got.body)).not.toContain(API_KEY);

    const { rows } = await h.testDb.pg.query<{ ciphertext: string }>(
      "select ciphertext from model_credentials where tenant_id = $1",
      [acme.tenantId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ciphertext).not.toContain(API_KEY);
  });

  it("tests the connection against the injected gateway", async () => {
    await h.call(`${base}/settings`, {
      method: "PUT",
      token: acme.admin.token,
      body: { provider: "openrouter", apiKey: API_KEY },
    });
    const tested = await h.call<{ ok: boolean; modelCount: number; fingerprint: string }>(`${base}/test`, {
      method: "POST",
      token: acme.admin.token,
    });
    expect(tested.status).toBe(200);
    expect(tested.body.data).toMatchObject({ ok: true, modelCount: 1, provider: "openrouter" });
    expect(fake.calls.listModels).toBe(1);
    expect(JSON.stringify(tested.body)).not.toContain(API_KEY);
  });

  it("rejects a blocked private endpoint with 422", async () => {
    const res = await h.call(`${base}/settings`, {
      method: "PUT",
      token: acme.admin.token,
      body: {
        provider: "openai_compatible",
        apiKey: API_KEY,
        baseUrl: "http://169.254.169.254/latest/meta-data",
      },
    });
    expect(res.status).toBe(422);
    expect(res.body.error?.code).toMatch(/validation_error|invalid_request/);
    expect(JSON.stringify(res.body)).not.toContain(API_KEY);
  });

  it("blocks other tenants and users without models:manage", async () => {
    const globex = await provisionCustomer(h, sm, "Globex", "owner@globex.test");
    expect((await h.call(`${base}/settings`, { token: globex.admin.token })).status).toBe(403);
    expect((await h.call(`${base}/test`, { method: "POST", token: globex.admin.token })).status).toBe(403);

    await h.call(`${base}/settings`, {
      method: "PUT",
      token: acme.admin.token,
      body: { provider: "openrouter", apiKey: API_KEY },
    });

    await h.testDb.pg.query("update tenant_memberships set role = 'customer_user' where user_id = $1", [
      acme.admin.id,
    ]);
    expect((await h.call(`${base}/settings`, { token: acme.admin.token })).status).toBe(403);
    expect(
      (
        await h.call(`${base}/settings`, {
          method: "PUT",
          token: acme.admin.token,
          body: { provider: "openrouter", apiKey: API_KEY },
        })
      ).status,
    ).toBe(403);
    expect((await h.call(`${base}/test`, { method: "POST", token: acme.admin.token })).status).toBe(403);
  });

  it("returns model_not_configured when testing without a key", async () => {
    const res = await h.call(`${base}/test`, { method: "POST", token: acme.admin.token });
    expect(res.status).toBe(422);
    expect(res.body.error?.code).toBe("model_not_configured");
  });

  it("maps provider auth failure to invalid_key without leaking the key", async () => {
    const broken = await createHarness(
      {
        createModelGateway: () => ({
          provider: "openrouter" as const,
          listModels: async () => {
            throw new ModelGatewayError("Unauthorized sk-or-v1-leaked", "auth_failed");
          },
          getCapabilities: async () => {
            throw new Error("unused");
          },
          complete: async () => {
            throw new Error("unused");
          },
          stream: () => {
            throw new Error("unused");
          },
          embed: async () => {
            throw new Error("unused");
          },
          estimateCost: async () => ({
            inputTokens: 0,
            outputTokens: 0,
            estimatedCostMicroUsd: null,
            costBasis: "unknown" as const,
          }),
        }),
      },
      "self_hosted",
      { MOS_DATA_KEY: DATA_KEY },
    );
    const staff = await broken.user("sm2@example.com", "success_manager");
    const customer = await provisionCustomer(broken, staff, "Initech", "owner@initech.test");
    const path = `/api/v1/workspaces/${customer.workspaceId}/models`;
    await broken.call(`${path}/settings`, {
      method: "PUT",
      token: customer.admin.token,
      body: { provider: "openrouter", apiKey: API_KEY },
    });
    const res = await broken.call(`${path}/test`, { method: "POST", token: customer.admin.token });
    expect(res.status).toBe(422);
    expect(res.body.error?.code).toBe("invalid_key");
    expect(JSON.stringify(res.body)).not.toContain(API_KEY);
    expect(JSON.stringify(res.body)).not.toContain("sk-or-v1-leaked");
    await broken.close();
  });
});
