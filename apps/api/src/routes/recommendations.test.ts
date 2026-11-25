import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertRecommendation, withContext } from "@marketing-os/db";
import { createHarness, provisionCustomer, type Harness, type ProvisionedCustomer, type TestUser } from "../testing/harness";

const fixture = {
  problem: "Spend rose without a lead change.",
  evidence: "mock.spend is 2550. Previous period is 2100. Lead count is unchanged.",
  proposedAction: "Create a Linear issue for the weekly review.",
  expectedImpact: "The specialist gets one tracked task.",
  confidence: "medium" as const,
  effort: "low" as const,
};

describe("recommendations API", () => {
  let h: Harness;
  let sm: TestUser;
  let acme: ProvisionedCustomer;
  let cockpitPath: string;
  let listPath: string;

  beforeEach(async () => {
    h = await createHarness();
    sm = await h.user("sm-reco@example.com", "success_manager");
    acme = await provisionCustomer(h, sm, "Acme Reco", "owner-reco@acme.test");
    cockpitPath = `/api/v1/workspaces/${acme.workspaceId}/cockpit`;
    listPath = `/api/v1/workspaces/${acme.workspaceId}/recommendations`;
    await withContext(h.testDb.db, { tenantId: acme.tenantId, userId: acme.admin.id, staff: false }, (tx) =>
      insertRecommendation(tx, {
        tenantId: acme.tenantId,
        workspaceId: acme.workspaceId,
        ...fixture,
      }),
    );
  });

  afterEach(() => h.close());

  async function enableFlag(): Promise<void> {
    await h.testDb.pg.query("update feature_flags set is_enabled = true where key = 'managed_work'");
  }

  it("keeps the cockpit list empty while managed_work is off", async () => {
    const view = await h.call<{ recommendations: { message: string }[] }>(cockpitPath, { token: acme.admin.token });
    expect(view.status).toBe(200);
    expect(view.body.data.recommendations).toEqual([]);
  });

  it("returns the fixture problem on the cockpit once managed_work is on", async () => {
    await enableFlag();
    const view = await h.call<{ recommendations: { id: string; message: string }[] }>(cockpitPath, {
      token: acme.admin.token,
    });
    expect(view.status).toBe(200);
    expect(view.body.data.recommendations).toEqual([
      expect.objectContaining({ message: fixture.problem }),
    ]);

    const listed = await h.call<{ problem: string }[]>(listPath, { token: acme.admin.token });
    expect(listed.status).toBe(200);
    expect(listed.body.data).toEqual([expect.objectContaining({ problem: fixture.problem })]);
  });

  it("returns 404 for another tenant", async () => {
    await enableFlag();
    const other = await provisionCustomer(h, sm, "Other Reco", "owner-reco@other.test");
    const cross = await h.call(listPath, { token: other.admin.token });
    expect(cross.status).toBe(404);
    expect(cross.body.error?.message).toBe("Not found");
  });

  it("returns 404 on the list while managed_work is off", async () => {
    const hidden = await h.call(listPath, { token: acme.admin.token });
    expect(hidden.status).toBe(404);
    expect(hidden.body.error?.message).toBe("Not found");
  });
});
