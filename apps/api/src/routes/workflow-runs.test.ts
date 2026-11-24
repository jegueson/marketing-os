import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { MockConnector } from "@marketing-os/connector-mock";
import {
  auditEvents,
  configVersions,
  metricDefinitions,
  staffAssignments,
  workflows,
} from "@marketing-os/db";
import { FakeGateway } from "@marketing-os/model-gateway";
import { loadMetricsYaml } from "@marketing-os/metrics";
import {
  createHarness,
  provisionCustomer,
  type Harness,
  type ProvisionedCustomer,
  type TestUser,
} from "../testing/harness";
import { consumeSyncMessage, enqueueDueSyncs } from "../sync/engine";

const DATA_KEY = btoa("0123456789abcdef0123456789abcdef");
const API_KEY = "sk-or-v1-fixture-workflow-run-key";
const INSTRUCTIONS = "Use only the metric values in the input. Do not invent numbers.";

const model = {
  id: "gpt-test",
  displayName: "GPT Test",
  provider: "openai_compatible" as const,
  inputPriceMicroUsdPer1M: 1_000_000,
  outputPriceMicroUsdPer1M: 1_000_000,
};

const skillDraft = {
  name: "weekly-performance-review",
  version: "1.0.0",
  description: "Compare the primary KPIs with the previous period.",
  domain: "performance",
  inputs: [],
  contextRequirements: ["business_profile", "metrics"],
  tools: [{ connector: "mock", tool: "list_campaigns" }],
  instructions: INSTRUCTIONS,
  outputs: [{ name: "summary", type: "string", description: "What changed", required: true }],
  evaluationSuite: "weekly-performance-review",
  riskClass: "low",
};

const businessDraft = {
  companyDescription: "Acme sells workflow software.",
  businessModel: "Subscription",
  products: ["Acme Cloud"],
  markets: ["United Kingdom"],
  businessGoals: ["Grow pipeline"],
  marketingGoals: ["Hold CAC"],
  primaryKpis: ["mock.spend"],
  reportingCadence: "weekly",
};

const workflowDefinition = {
  name: "weekly-performance-review",
  version: "1.0.0",
  description: "Monday performance review against mock metrics.",
  trigger: { type: "manual" as const },
  steps: [
    { id: "ctx", kind: "load_context" as const, include: ["business_profile" as const] },
    {
      id: "spend",
      kind: "read_metrics" as const,
      metricKey: "mock.spend",
      range: "last_30_days" as const,
      compareToPrevious: true,
    },
    {
      id: "skill",
      kind: "run_skill" as const,
      skill: "weekly-performance-review",
      version: "1.0.0",
      inputFrom: ["ctx", "spend"],
    },
    { id: "report", kind: "render_report" as const, title: "Weekly review", fromSteps: ["spend", "skill"] },
  ],
};

function fakeGateway() {
  return new FakeGateway({
    models: [model],
    completeScripts: [{ content: JSON.stringify({ summary: "Spend moved with the observed value." }) }],
  });
}

describe("workflow test-run API", () => {
  let h: Harness;
  let sm: TestUser;
  let specialist: TestUser;
  let acme: ProvisionedCustomer;
  let fake: FakeGateway;

  afterEach(() => h?.close());

  async function boot() {
    fake = fakeGateway();
    h = await createHarness(
      { createModelGateway: () => fake },
      "self_hosted",
      { MOS_DATA_KEY: DATA_KEY },
    );
    sm = await h.user("sm-runs@example.com", "success_manager");
    specialist = await h.user("specialist-runs@example.com", "ai_specialist");
    acme = await provisionCustomer(h, sm, "Acme Runs", "owner-runs@acme.test");
    await h.testDb.db.insert(staffAssignments).values({
      tenantId: acme.tenantId,
      userId: specialist.id,
      role: "ai_specialist",
    });
  }

  async function enableConfig(): Promise<void> {
    await h.testDb.pg.query("update feature_flags set is_enabled = true where key = 'specialist_config'");
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
    const created = await h.call<{ id: string }>(`/api/v1/workspaces/${acme.workspaceId}/connections`, {
      method: "POST",
      token: acme.admin.token,
      body: { connectorSlug: "mock", displayName: "Mock data" },
    });
    const connectionId = created.body.data.id;
    await h.call(`/api/v1/workspaces/${acme.workspaceId}/connections/${connectionId}/scopes`, {
      method: "PUT",
      token: acme.admin.token,
      body: { resources: [{ resourceType: "account", resourceId: "mock-account-1" }] },
    });
    const queued = (await enqueueDueSyncs(h.testDb.db)).filter((message) => message.connectionId === connectionId);
    const connectors = new Map([["mock", new MockConnector()]]);
    for (const message of queued) {
      expect(await consumeSyncMessage(h.testDb.db, message, connectors)).toBe("ack");
    }
    const catalog = loadMetricsYaml(
      join(dirname(fileURLToPath(import.meta.url)), "../../../../customer-configs/_templates/metrics.yaml"),
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

  async function publishSkillAndProfile(): Promise<void> {
    const profilesBase = `/api/v1/workspaces/${acme.workspaceId}/profiles/business`;
    const savedProfile = await h.call(profilesBase, {
      method: "PUT",
      token: specialist.token,
      body: businessDraft,
    });
    expect(savedProfile.status).toBe(200);
    expect(
      (await h.call(`${profilesBase}/publish`, { method: "POST", token: specialist.token })).status,
    ).toBe(200);

    const skillsBase = `/api/v1/workspaces/${acme.workspaceId}/skills`;
    const skill = await h.call<{ id: string }>(skillsBase, {
      method: "POST",
      token: specialist.token,
      body: skillDraft,
    });
    expect(skill.status).toBe(200);
    expect(
      (await h.call(`${skillsBase}/${skill.body.data.id}/publish`, {
        method: "POST",
        token: specialist.token,
      })).status,
    ).toBe(200);
  }

  async function seedPublishedWorkflow(): Promise<string> {
    const [row] = await h.testDb.db
      .insert(workflows)
      .values({
        tenantId: acme.tenantId,
        workspaceId: acme.workspaceId,
        status: "published",
        draft: workflowDefinition,
        activeVersion: 1,
      })
      .returning({ id: workflows.id });
    await h.testDb.db.insert(configVersions).values({
      tenantId: acme.tenantId,
      workspaceId: acme.workspaceId,
      resourceType: "workflow",
      resourceId: row!.id,
      version: 1,
      document: workflowDefinition,
      publishedBy: specialist.id,
    });
    return row!.id;
  }

  it("hides test-run routes until the flag is on", async () => {
    await boot();
    const workflowId = crypto.randomUUID();
    const hidden = await h.call(
      `/api/v1/workspaces/${acme.workspaceId}/workflows/${workflowId}/test-runs`,
      { method: "POST", token: specialist.token },
    );
    expect(hidden.status).toBe(404);
    expect(hidden.body.error?.message).toBe("Not found");
    expect(
      (
        await h.call(`/api/v1/workspaces/${acme.workspaceId}/test-runs/${crypto.randomUUID()}`, {
          token: specialist.token,
        })
      ).status,
    ).toBe(404);
  });

  it("refuses another tenant and omits skill instructions from the run", async () => {
    await boot();
    await enableConfig();
    await saveModel();
    await seedMockSpend();
    await publishSkillAndProfile();
    const workflowId = await seedPublishedWorkflow();

    const created = await h.call<{
      id: string;
      status: string;
      report: { body: string } | null;
      steps: unknown[];
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

    const other = await provisionCustomer(h, sm, "Other Runs", "owner-runs@other.test");
    expect(
      (
        await h.call(`/api/v1/workspaces/${acme.workspaceId}/test-runs/${created.body.data.id}`, {
          token: other.admin.token,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await h.call(`/api/v1/workspaces/${acme.workspaceId}/workflows/${workflowId}/test-runs`, {
          method: "POST",
          token: other.admin.token,
        })
      ).status,
    ).toBe(403);

    const audits = await h.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "config.workflow_test_run"));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      tenantId: acme.tenantId,
      actorId: specialist.id,
      resourceType: "workflow_run",
      resourceId: created.body.data.id,
    });
    expect(JSON.stringify(audits[0]?.payload ?? {})).not.toContain(INSTRUCTIONS);
    expect(JSON.stringify(audits[0]?.payload ?? {})).not.toContain("Spend moved");
  });
});
