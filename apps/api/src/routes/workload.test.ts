import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertWorkload, withContext } from "@marketing-os/db";
import { createHarness, provisionCustomer, type Harness, type ProvisionedCustomer, type TestUser } from "../testing/harness";

const fixture = {
  category: "reporting" as const,
  baselineHours: 40,
  hoursAbsorbed: 12,
};

describe("workload API", () => {
  let h: Harness;
  let sm: TestUser;
  let acme: ProvisionedCustomer;
  let cockpitPath: string;

  beforeEach(async () => {
    h = await createHarness();
    sm = await h.user("sm-workload@example.com", "success_manager");
    acme = await provisionCustomer(h, sm, "Acme Workload", "owner-workload@acme.test");
    cockpitPath = `/api/v1/workspaces/${acme.workspaceId}/cockpit`;
  });

  afterEach(() => h.close());

  it("returns an empty list when the tenant has no workload rows", async () => {
    const view = await h.call<{ workload: unknown[] }>(cockpitPath, { token: acme.admin.token });
    expect(view.status).toBe(200);
    expect(view.body.data.workload).toEqual([]);
  });

  it("returns the inserted hours and does not add a savings figure", async () => {
    await withContext(h.testDb.db, { tenantId: acme.tenantId, userId: acme.admin.id, staff: false }, (tx) =>
      insertWorkload(tx, {
        tenantId: acme.tenantId,
        workspaceId: acme.workspaceId,
        ...fixture,
      }),
    );
    const view = await h.call<{ workload: typeof fixture[] }>(cockpitPath, { token: acme.admin.token });
    expect(view.status).toBe(200);
    expect(view.body.data.workload).toEqual([fixture]);
    expect(JSON.stringify(view.body.data.workload)).not.toContain("saving");
  });
});
