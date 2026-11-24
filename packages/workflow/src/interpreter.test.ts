import { describe, expect, it, vi } from "vitest";
import { FakeGateway } from "@marketing-os/model-gateway";
import type { WorkflowDefinition } from "@marketing-os/schemas";
import { createInMemoryWorkflowPort } from "./memory";
import { interpretWorkflow, type WorkflowDeps } from "./interpreter";

const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tenantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const workspaceA = "11111111-1111-4111-8111-111111111111";
const workflowId = "33333333-3333-4333-8333-333333333333";

const skill = {
  name: "weekly-performance-review",
  version: "1.0.0",
  description: "Compare the primary KPIs with the previous period.",
  domain: "performance" as const,
  inputs: [] as { name: string; type: "string"; description: string; required: boolean }[],
  contextRequirements: ["business_profile" as const, "metrics" as const],
  tools: [{ connector: "mock", tool: "list_campaigns" }],
  instructions: "Use only the metric values in the input. Do not invent numbers.",
  outputs: [{ name: "summary", type: "string" as const, description: "What changed", required: true }],
  evaluationSuite: "weekly-performance-review",
  riskClass: "low" as const,
};

const manualWorkflow: WorkflowDefinition = {
  name: "weekly-performance-review",
  version: "1.0.0",
  description: "Monday performance review against mock metrics.",
  trigger: { type: "manual" },
  steps: [
    { id: "ctx", kind: "load_context", include: ["business_profile"] },
    {
      id: "spend",
      kind: "read_metrics",
      metricKey: "mock.spend",
      range: "last_7_days",
      compareToPrevious: true,
    },
    {
      id: "skill",
      kind: "run_skill",
      skill: "weekly-performance-review",
      version: "1.0.0",
      inputFrom: ["ctx", "spend"],
    },
    { id: "knowledge", kind: "retrieve_knowledge", sourceIds: [], query: "brand notes" },
    { id: "report", kind: "render_report", title: "Weekly review", fromSteps: ["spend", "skill"] },
  ],
};

const scheduleWorkflow: WorkflowDefinition = {
  ...manualWorkflow,
  trigger: { type: "schedule", minute: 0, hour: 8, dayOfWeek: 1 },
};

function modelInfo() {
  return {
    id: "gpt-test",
    displayName: "gpt-test",
    provider: "openai_compatible" as const,
    inputPriceMicroUsdPer1M: 1_000_000,
    outputPriceMicroUsdPer1M: 2_000_000,
  };
}

function deps(overrides: Partial<WorkflowDeps> = {}): WorkflowDeps & { gateway: FakeGateway } {
  const gateway =
    (overrides.gateway as FakeGateway | undefined) ??
    new FakeGateway({
      models: [modelInfo()],
      completeScripts: [{ content: JSON.stringify({ summary: "Spend moved with the observed value." }) }],
    });
  const listActions =
    overrides.listActions ??
    vi.fn(async () => {
      throw new Error("listActions must not run in Sprint 4");
    });
  return {
    model: "gpt-test",
    reader: {
      async metricValue(query) {
        if (query.tenantId !== tenantA || query.workspaceId !== workspaceA) {
          return { metricKey: query.metricKey, status: "no_data" as const, value: null, unit: null };
        }
        return {
          metricKey: query.metricKey,
          status: "ok" as const,
          value: query.metricKey === "mock.spend" ? 2550 : 0,
          unit: "EUR",
        };
      },
      async metricCompare(query) {
        if (query.tenantId !== tenantA || query.workspaceId !== workspaceA) {
          return {
            metricKey: query.metricKey,
            status: "no_data" as const,
            current: null,
            previous: null,
            delta: null,
            unit: null,
          };
        }
        return {
          metricKey: query.metricKey,
          status: "ok" as const,
          current: 2550,
          previous: 2000,
          delta: 550,
          unit: "EUR",
        };
      },
    },
    async loadBusinessProfile(tenantId) {
      if (tenantId !== tenantA) return null;
      return {
        companyDescription: "Acme sells workflow software.",
        businessModel: "Subscription",
        products: ["Acme Cloud"],
        markets: ["United Kingdom"],
        businessGoals: ["Grow pipeline"],
        marketingGoals: ["Hold CAC"],
        primaryKpis: ["mock.spend"],
        reportingCadence: "weekly" as const,
      };
    },
    async loadBrandProfile() {
      return null;
    },
    async loadPublishedSkill(_tenantId, _workspaceId, name, version) {
      if (name === skill.name && version === skill.version) return skill;
      return null;
    },
    ...overrides,
    gateway,
    listActions,
  };
}

describe("workflow step interpreter", () => {
  it("finishes a manual workflow on the in-memory port with mock.spend in the report", async () => {
    const port = createInMemoryWorkflowPort();
    const started = await port.start({
      tenantId: tenantA,
      workspaceId: workspaceA,
      workflowId,
      workflowVersion: 1,
      trigger: "manual",
    });
    const wired = deps();
    const outcome = await interpretWorkflow(manualWorkflow, {
      tenantId: tenantA,
      workspaceId: workspaceA,
      deps: wired,
    });
    expect(outcome.status).toBe("succeeded");
    expect(outcome.errorCode).toBeNull();
    expect(outcome.report?.body).toContain("mock.spend");
    expect(outcome.report?.body).toContain("2550");
    expect(wired.listActions).not.toHaveBeenCalled();
    expect(wired.gateway.calls.complete).toHaveLength(1);
    const user = wired.gateway.calls.complete[0]?.messages.find((message) => message.role === "user");
    expect(user?.content).toContain("<<<DATA");
    expect(user?.content).not.toMatch(/^Use only the metric values/m);

    expect(await port.complete({ tenantId: tenantA, runId: started.runId, outcome })).toBe(true);
    const run = await port.get({ tenantId: tenantA, runId: started.runId });
    expect(run?.status).toBe("succeeded");
    expect(run?.report?.body).toContain("2550");
  });

  it("refuses a schedule trigger without calling the gateway", async () => {
    const wired = deps();
    const outcome = await interpretWorkflow(scheduleWorkflow, {
      tenantId: tenantA,
      workspaceId: workspaceA,
      deps: wired,
    });
    expect(outcome).toMatchObject({ status: "failed", errorCode: "trigger_not_active", report: null });
    expect(wired.gateway.calls.complete).toHaveLength(0);
    expect(wired.listActions).not.toHaveBeenCalled();
  });

  it("does not load another tenant's business profile into a skill", async () => {
    const secret = "TENANT-B-SECRET-PROFILE";
    const wired = deps({
      async loadBusinessProfile(tenantId) {
        if (tenantId === tenantB) {
          return {
            companyDescription: secret,
            businessModel: "Hidden",
            products: [],
            markets: [],
            businessGoals: [],
            marketingGoals: [],
            primaryKpis: ["mock.spend"],
            reportingCadence: "weekly",
          };
        }
        return {
          companyDescription: "Acme sells workflow software.",
          businessModel: "Subscription",
          products: ["Acme Cloud"],
          markets: ["United Kingdom"],
          businessGoals: ["Grow pipeline"],
          marketingGoals: ["Hold CAC"],
          primaryKpis: ["mock.spend"],
          reportingCadence: "weekly",
        };
      },
    });
    const outcome = await interpretWorkflow(manualWorkflow, {
      tenantId: tenantA,
      workspaceId: workspaceA,
      deps: wired,
    });
    expect(outcome.status).toBe("succeeded");
    const user = wired.gateway.calls.complete[0]?.messages.find((message) => message.role === "user");
    expect(user?.content).not.toContain(secret);
    expect(user?.content).toContain("Acme sells workflow software.");
  });

  it("formats report metrics from read_metrics steps only", async () => {
    const wired = deps({
      gateway: new FakeGateway({
        models: [modelInfo()],
        completeScripts: [
          {
            content: JSON.stringify({
              summary: "ok",
              metricKey: "mock.spend",
              value: 999_999,
            }),
          },
        ],
      }),
    });
    const outcome = await interpretWorkflow(manualWorkflow, {
      tenantId: tenantA,
      workspaceId: workspaceA,
      deps: wired,
    });
    expect(outcome.status).toBe("succeeded");
    expect(outcome.report?.body).toContain("2550");
    expect(outcome.report?.body).not.toContain("999999");
  });

  it("fails when the skill completion is truncated", async () => {
    const wired = deps({
      gateway: new FakeGateway({
        models: [modelInfo()],
        completeScripts: [{ content: '{"summary":"', finishReason: "length" }],
      }),
    });
    const outcome = await interpretWorkflow(manualWorkflow, {
      tenantId: tenantA,
      workspaceId: workspaceA,
      deps: wired,
    });
    expect(outcome).toMatchObject({ status: "failed", errorCode: "skill_output_invalid", report: null });
  });
});

