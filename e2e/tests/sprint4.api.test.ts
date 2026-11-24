/**
 * Sprint 4 exit journey: import weekly review YAML, mock-metric test-run,
 * fixture spend in the report, cross-tenant 403, flag-off 404, no prompt bodies
 * in durable rows. Checklist: docs/security/s4-review.md.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockConnector } from "../../connectors/mock/src/index";
import { FakeGateway } from "../../packages/model-gateway/src/index";
import { loadMetricsYaml } from "../../packages/metrics/src/index";
import { metricDefinitions, staffAssignments } from "../../packages/db/src/schema/index";
import { consumeSyncMessage, enqueueDueSyncs } from "../../apps/api/src/sync/engine";
import {
  createHarness,
  provisionCustomer,
  type Harness,
  type ProvisionedCustomer,
  type TestUser,
} from "../../apps/api/src/testing/harness";

const DATA_KEY = btoa("0123456789abcdef0123456789abcdef");
const API_KEY = "sk-or-v1-fixture-sprint4-journey";
const INSTRUCTIONS = "Use only the metric values in the input. Do not invent numbers.";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const model = {
  id: "gpt-test",
  displayName: "GPT Test",
  provider: "openai_compatible" as const,
  inputPriceMicroUsdPer1M: 1_000_000,
  outputPriceMicroUsdPer1M: 1_000_000,
};

function readExample(relative: string): string {
  return readFileSync(join(repoRoot, relative), "utf8");
}

describe("sprint 4 journey", () => {
  let h: Harness;
  let fake: FakeGateway;
  let sm: TestUser;
  let specialist: TestUser;
  let acme: ProvisionedCustomer;

  beforeEach(async () => {
    fake = new FakeGateway({
      models: [model],
      completeScripts: [
        { content: JSON.stringify({ summary: "Spend moved with the observed value." }) },
      ],
    });
    h = await createHarness(
      { createModelGateway: () => fake },
      "self_hosted",
      { MOS_DATA_KEY: DATA_KEY },
    );
    sm = await h.user("sm-s4@example.com", "success_manager");
    specialist = await h.user("specialist-s4@example.com", "ai_specialist");
    acme = await provisionCustomer(h, sm, "Acme S4", "owner-s4@acme.test");
    await h.testDb.db.insert(staffAssignments).values({
      tenantId: acme.tenantId,
      userId: specialist.id,
      role: "ai_specialist",
    });
  });

  afterEach(() => h.close());

  async function enableConfig(): Promise<void> {
    await h.testDb.pg.query(
      "update feature_flags set is_enabled = true where key = 'specialist_config'",
    );
  }

  async function saveModel(): Promise<void> {
    const saved = await h.call(`/api/v1/workspaces/${acme.workspaceId}/models/settings`, {
      method: "PUT",
      token: acme.admin.token,
      body: { provider: "openrouter", apiKey: API_KEY, defaultModel: model.id },
    });
    expect(saved.status).toBe(200);
  }

  async function seedMockSpend(): Promise<void> {
    const created = await h.call<{ id: string }>(
      `/api/v1/workspaces/${acme.workspaceId}/connections`,
      {
        method: "POST",
        token: acme.admin.token,
        body: { connectorSlug: "mock", displayName: "Mock data" },
      },
    );
    const connectionId = created.body.data.id;
    await h.call(`/api/v1/workspaces/${acme.workspaceId}/connections/${connectionId}/scopes`, {
      method: "PUT",
      token: acme.admin.token,
      body: { resources: [{ resourceType: "account", resourceId: "mock-account-1" }] },
    });
    const due = (await enqueueDueSyncs(h.testDb.db)).filter(
      (message) => message.connectionId === connectionId,
    );
    const connectors = new Map([["mock", new MockConnector()]]);
    for (const message of due) {
      expect(await consumeSyncMessage(h.testDb.db, message, connectors)).toBe("ack");
    }
    const catalog = loadMetricsYaml(
      join(repoRoot, "customer-configs/_templates/metrics.yaml"),
    );
    await h.testDb.db.insert(metricDefinitions).values(
      catalog.definitions.map((definition) => ({
        key: definition.key,
        source: definition.source,
        version: definition.version,
        label: definition.label,
        unit: definition.unit ?? null,
        formula: definition.formula ?? null,
        target: definition.target == null ? null : String(definition.target),
        widgets: definition.widgets ?? [],
      })),
    );
  }

  it("imports weekly review, returns fixture spend, denies other tenants, and scrubs prompts", async () => {
    const importPath = `/api/v1/workspaces/${acme.workspaceId}/config/import`;
    const flagOff = await h.call(importPath, {
      method: "POST",
      token: specialist.token,
      body: { kind: "skill", source: "name: x\n" },
    });
    expect(flagOff.status).toBe(404);

    await enableConfig();
    await saveModel();
    await seedMockSpend();

    const skillSource = readExample("skills/starter/weekly-performance-review/skill.yaml");
    const workflowSource = readExample(
      "customer-configs/examples/weekly-performance-review/workflow.yaml",
    );
    // Mirrors customer-configs/examples/weekly-performance-review/business-profile.yaml
    const business = {
      companyDescription: "Acme sells workflow software to mid-market marketing teams.",
      businessModel: "Subscription",
      products: ["Acme Cloud"],
      markets: ["United Kingdom"],
      businessGoals: ["Grow pipeline"],
      marketingGoals: ["Hold CAC"],
      primaryKpis: ["mock.spend"],
      reportingCadence: "weekly",
    };

    const skillImport = await h.call<{ kind: string; id: string; name: string; version: number }>(
      importPath,
      {
        method: "POST",
        token: specialist.token,
        body: { kind: "skill", source: skillSource },
      },
    );
    expect(skillImport.status).toBe(200);
    expect(skillImport.body.data).toMatchObject({
      kind: "skill",
      name: "weekly-performance-review",
      version: 1,
    });

    const workflowImport = await h.call<{
      kind: string;
      id: string;
      name: string;
      version: number;
    }>(importPath, {
      method: "POST",
      token: specialist.token,
      body: { kind: "workflow", source: workflowSource },
    });
    expect(workflowImport.status).toBe(200);
    expect(workflowImport.body.data).toMatchObject({
      kind: "workflow",
      name: "weekly-performance-review",
      version: 1,
    });
    const workflowId = workflowImport.body.data.id;

    const profilesBase = `/api/v1/workspaces/${acme.workspaceId}/profiles/business`;
    expect(
      (await h.call(profilesBase, { method: "PUT", token: specialist.token, body: business }))
        .status,
    ).toBe(200);
    expect(
      (await h.call(`${profilesBase}/publish`, { method: "POST", token: specialist.token })).status,
    ).toBe(200);

    const listed = await h.call<Array<{ id: string; draft: { name?: string } }>>(
      `/api/v1/workspaces/${acme.workspaceId}/workflows`,
      { token: specialist.token },
    );
    expect(listed.status).toBe(200);
    expect(listed.body.data.some((row) => row.id === workflowId)).toBe(true);

    const created = await h.call<{
      id: string;
      status: string;
      report: { body: string } | null;
    }>(`/api/v1/workspaces/${acme.workspaceId}/workflows/${workflowId}/test-runs`, {
      method: "POST",
      token: specialist.token,
    });
    expect(created.status).toBe(200);
    expect(created.body.data.status).toBe("succeeded");
    expect(created.body.data.report?.body).toContain("mock.spend");
    expect(created.body.data.report?.body).toContain("2550");
    expect(JSON.stringify(created.body)).not.toContain(INSTRUCTIONS);

    const got = await h.call<{ report: { body: string } | null }>(
      `/api/v1/workspaces/${acme.workspaceId}/test-runs/${created.body.data.id}`,
      { token: specialist.token },
    );
    expect(got.status).toBe(200);
    expect(got.body.data.report?.body).toContain("2550");
    expect(JSON.stringify(got.body)).not.toContain(INSTRUCTIONS);

    const other = await provisionCustomer(h, sm, "Other S4", "owner-s4@other.test");
    expect(
      (
        await h.call(`/api/v1/workspaces/${acme.workspaceId}/test-runs/${created.body.data.id}`, {
          token: other.admin.token,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await h.call(importPath, {
          method: "POST",
          token: other.admin.token,
          body: { kind: "skill", source: skillSource },
        })
      ).status,
    ).toBe(403);

    const { rows: runRows } = await h.testDb.pg.query<{ steps: unknown; report: unknown }>(
      "select steps, report from workflow_runs where id = $1",
      [created.body.data.id],
    );
    expect(runRows).toHaveLength(1);
    expect(JSON.stringify(runRows[0])).not.toContain(INSTRUCTIONS);

    const { rows: audits } = await h.testDb.pg.query<{ resource_id: string; payload: unknown }>(
      "select resource_id, payload from audit_events where event_type = 'config.workflow_test_run'",
    );
    expect(audits.some((row) => row.resource_id === created.body.data.id)).toBe(true);
    expect(JSON.stringify(audits)).not.toContain(INSTRUCTIONS);

    const { rows: ledger } = await h.testDb.pg.query(
      "select * from usage_ledger where tenant_id = $1",
      [acme.tenantId],
    );
    expect(JSON.stringify(ledger)).not.toContain(INSTRUCTIONS);
    expect(JSON.stringify(ledger)).not.toContain(API_KEY);
  });
});
