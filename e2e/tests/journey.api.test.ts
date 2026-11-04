/**
 * API-level journey used when Playwright browsers are unavailable in CI.
 * Mirrors lead → convert → connect mock → cockpit and cross-tenant denial.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../apps/api/src/app";
import { memoryStore } from "../../apps/api/src/store/memory";

const env = {
  MOS_DEPLOYMENT_MODE: "cloud",
  APP_ORIGIN: "http://127.0.0.1:3000",
} as Env;

const staff = {
  "content-type": "application/json",
  "x-user-id": "11111111-1111-1111-1111-111111111111",
  "x-user-email": "sm@example.com",
  "x-user-role": "success_manager",
};

describe("sprint1 journeys", () => {
  beforeEach(() => memoryStore.reset());

  it("cloud journey: lead to cockpit", async () => {
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
    const leadId = ((await create.json()) as { data: { id: string } }).data.id;

    for (const status of ["contacted", "discovery", "qualified"] as const) {
      await app.request(
        `/api/v1/leads/${leadId}/status`,
        { method: "PATCH", headers: staff, body: JSON.stringify({ status }) },
        env,
      );
    }

    const convert = await app.request(
      `/api/v1/leads/${leadId}/convert`,
      { method: "POST", headers: staff },
      env,
    );
    expect(convert.status).toBe(201);
    const converted = (await convert.json()) as {
      data: { workspace: { id: string }; tenant: { id: string } };
    };

    const connect = await app.request(
      "/api/v1/connections",
      {
        method: "POST",
        headers: { ...staff, "x-tenant-id": converted.data.tenant.id },
        body: JSON.stringify({
          workspaceId: converted.data.workspace.id,
          connectorSlug: "mock",
          displayName: "Mock",
          scopes: ["campaigns"],
        }),
      },
      env,
    );
    expect(connect.status).toBe(201);

    const cockpit = await app.request(
      `/api/v1/workspaces/${converted.data.workspace.id}/cockpit`,
      {
        headers: {
          ...staff,
          "x-tenant-id": converted.data.tenant.id,
          "x-user-role": "customer_admin",
        },
      },
      env,
    );
    expect(cockpit.status).toBe(200);
  });

  it("negative: customer cannot see another tenant connection", async () => {
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
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toEqual([]);
  });
});
