import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { memoryStore } from "./store/memory";

const env = {
  MOS_DEPLOYMENT_MODE: "self_hosted",
  APP_ORIGIN: "http://127.0.0.1:3000",
} as Env;

type Envelope<T> = {
  success: boolean;
  data: T;
  error: { code: string; message: string } | null;
};

function staffHeaders(): HeadersInit {
  return {
    "content-type": "application/json",
    "x-user-id": "11111111-1111-1111-1111-111111111111",
    "x-user-email": "sm@example.com",
    "x-user-role": "success_manager",
  };
}

describe("api journey", () => {
  beforeEach(() => {
    memoryStore.reset();
  });

  it("returns healthz", async () => {
    const app = createApp();
    const res = await app.request("/healthz", {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Envelope<{ status: string }>;
    expect(body.success).toBe(true);
  });

  it("rejects invalid public leads", async () => {
    const app = createApp();
    const res = await app.request(
      "/api/v1/public/leads",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) },
      env,
    );
    expect(res.status).toBe(422);
  });

  it("runs lead to cockpit journey", async () => {
    const app = createApp();
    const create = await app.request(
      "/api/v1/public/leads",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyName: "Acme",
          contactName: "Ada",
          email: "ada@acme.test",
          intent: "cloud_workspace",
        }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const created = (await create.json()) as Envelope<{ id: string }>;
    const leadId = created.data.id;

    await app.request(
      `/api/v1/leads/${leadId}/status`,
      {
        method: "PATCH",
        headers: staffHeaders(),
        body: JSON.stringify({ status: "contacted" }),
      },
      env,
    );
    await app.request(
      `/api/v1/leads/${leadId}/status`,
      {
        method: "PATCH",
        headers: staffHeaders(),
        body: JSON.stringify({ status: "discovery" }),
      },
      env,
    );
    await app.request(
      `/api/v1/leads/${leadId}/status`,
      {
        method: "PATCH",
        headers: staffHeaders(),
        body: JSON.stringify({ status: "qualified" }),
      },
      env,
    );

    const convert = await app.request(
      `/api/v1/leads/${leadId}/convert`,
      { method: "POST", headers: staffHeaders() },
      env,
    );
    expect(convert.status).toBe(201);
    const converted = (await convert.json()) as Envelope<{
      workspace: { id: string };
      tenant: { id: string };
    }>;
    const workspaceId = converted.data.workspace.id;
    const tenantId = converted.data.tenant.id;

    const connect = await app.request(
      "/api/v1/connections",
      {
        method: "POST",
        headers: {
          ...staffHeaders(),
          "x-tenant-id": tenantId,
        },
        body: JSON.stringify({
          workspaceId,
          connectorSlug: "mock",
          displayName: "Mock",
          scopes: ["campaigns", "leads"],
        }),
      },
      env,
    );
    expect(connect.status).toBe(201);

    const cockpit = await app.request(
      `/api/v1/workspaces/${workspaceId}/cockpit`,
      {
        headers: {
          ...staffHeaders(),
          "x-tenant-id": tenantId,
          "x-user-role": "customer_admin",
        },
      },
      env,
    );
    expect(cockpit.status).toBe(200);
    const view = (await cockpit.json()) as Envelope<{
      data_health: unknown[];
      empty_state: unknown;
    }>;
    expect(view.data.data_health).toHaveLength(1);
    expect(view.data.empty_state).toBeNull();
  });

  it("blocks cross-tenant connection listing for customers", async () => {
    const app = createApp();
    memoryStore.connections.set("c1", {
      id: "c1",
      tenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      workspaceId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      connectorSlug: "mock",
      displayName: "Other",
      status: "active",
      scopes: ["campaigns"],
    });
    const res = await app.request(
      "/api/v1/connections",
      {
        headers: {
          "x-user-id": "22222222-2222-2222-2222-222222222222",
          "x-user-role": "customer_admin",
          "x-tenant-id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
        },
      },
      env,
    );
    const body = (await res.json()) as Envelope<unknown[]>;
    expect(body.data).toEqual([]);
  });
});
