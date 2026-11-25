import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { staffAssignments } from "@marketing-os/db";
import {
  createHarness,
  provisionCustomer,
  type Harness,
  type ProvisionedCustomer,
  type TestUser,
} from "../testing/harness";

const skillSource = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../skills/starter/weekly-performance-review/skill.yaml",
  ),
  "utf8",
);
const policySource = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../customer-configs/examples/linear-create-issue/policy.yaml",
  ),
  "utf8",
);

describe("config import API", () => {
  let h: Harness;
  let sm: TestUser;
  let specialist: TestUser;
  let acme: ProvisionedCustomer;

  afterEach(() => h?.close());

  async function boot() {
    h = await createHarness();
    sm = await h.user("sm-import@example.com", "success_manager");
    specialist = await h.user("specialist-import@example.com", "ai_specialist");
    acme = await provisionCustomer(h, sm, "Acme Import", "owner-import@acme.test");
    await h.testDb.db.insert(staffAssignments).values({
      tenantId: acme.tenantId,
      userId: specialist.id,
      role: "ai_specialist",
    });
  }

  it("hides import until the flag is on and publishes the weekly skill", async () => {
    await boot();
    const path = `/api/v1/workspaces/${acme.workspaceId}/config/import`;
    expect(
      (
        await h.call(path, {
          method: "POST",
          token: specialist.token,
          body: { kind: "skill", source: skillSource },
        })
      ).status,
    ).toBe(404);

    await h.testDb.pg.query(
      "update feature_flags set is_enabled = true where key = 'specialist_config'",
    );
    const imported = await h.call<{ kind: string; name: string; version: number }>(path, {
      method: "POST",
      token: specialist.token,
      body: { kind: "skill", source: skillSource },
    });
    expect(imported.status).toBe(200);
    expect(imported.body.data).toMatchObject({
      kind: "skill",
      name: "weekly-performance-review",
      version: 1,
    });

    const other = await provisionCustomer(h, sm, "Other Import", "owner-import@other.test");
    expect(
      (
        await h.call(path, {
          method: "POST",
          token: other.admin.token,
          body: { kind: "skill", source: skillSource },
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await h.call(path, {
          method: "POST",
          token: specialist.token,
          body: { kind: "skill", source: "not: valid yaml {" },
        })
      ).status,
    ).toBe(422);
  });

  it("publishes the example Linear policy and rejects requireApproval false", async () => {
    await boot();
    await h.testDb.pg.query(
      "update feature_flags set is_enabled = true where key = 'specialist_config'",
    );
    const path = `/api/v1/workspaces/${acme.workspaceId}/config/import`;
    const denied = await h.call(path, {
      method: "POST",
      token: specialist.token,
      body: { kind: "policy", source: policySource.replace("requireApproval: true", "requireApproval: false") },
    });
    expect(denied.status).toBe(422);

    const imported = await h.call<{ kind: string; name: string; version: number }>(path, {
      method: "POST",
      token: specialist.token,
      body: { kind: "policy", source: policySource },
    });
    expect(imported.status).toBe(200);
    expect(imported.body.data).toMatchObject({
      kind: "policy",
      name: "linear-create-issue",
      version: 1,
    });
  });
});
