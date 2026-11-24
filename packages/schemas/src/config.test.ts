import { describe, expect, it } from "vitest";
import {
  agentDefinitionSchema,
  brandProfileSchema,
  businessProfileSchema,
  knowledgeSourceSchema,
  skillDefinitionSchema,
  tenantPromptNameSchema,
  toolAllowlistEntrySchema,
  workflowDefinitionSchema,
} from "./config";

const business = {
  companyDescription: "Acme sells workflow software to mid-market teams.",
  businessModel: "Subscription",
  products: ["Acme Cloud"],
  markets: ["United Kingdom"],
  businessGoals: ["Grow qualified pipeline"],
  marketingGoals: ["Hold CAC"],
  primaryKpis: ["mock.spend"],
  reportingCadence: "weekly" as const,
};

const brand = {
  positioning: "The operating system for a marketing team.",
  audience: "Marketing leads at B2B software companies.",
  tone: ["direct"],
  preferredTerms: ["pipeline"],
  bannedTerms: ["synergy"],
  approvedClaims: ["Connects the tools you already use"],
  prohibitedClaims: ["Guarantees revenue"],
  marketLanguage: ["en-GB"],
  exampleAssetIds: [],
};

const skill = {
  name: "weekly-performance-review",
  version: "1.0.0",
  description: "Compare the primary KPIs with the previous period.",
  domain: "performance" as const,
  inputs: [{ name: "cadence", type: "string" as const, description: "Reporting cadence", required: true }],
  contextRequirements: ["business_profile" as const, "metrics" as const],
  tools: [{ connector: "mock", tool: "query_metrics" }],
  instructions: "Use only the metric values in the input. Do not invent numbers.",
  outputs: [{ name: "summary", type: "string" as const, description: "What changed", required: true }],
  evaluationSuite: "weekly-performance-review",
  riskClass: "low" as const,
};

const workflow = {
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
      range: "last_7_days" as const,
      compareToPrevious: true,
    },
    {
      id: "skill",
      kind: "run_skill" as const,
      skill: "weekly-performance-review",
      version: "1.0.0",
      inputFrom: ["ctx", "spend"],
    },
    { id: "report", kind: "render_report" as const, title: "Weekly review", fromSteps: ["skill"] },
  ],
};

describe("specialist configuration contracts", () => {
  it("accepts a business profile and rejects unknown keys", () => {
    expect(businessProfileSchema.parse(business).reportingCadence).toBe("weekly");
    expect(businessProfileSchema.safeParse({ ...business, sql: "select 1" }).success).toBe(false);
  });

  it("accepts a brand profile", () => {
    expect(brandProfileSchema.parse(brand).tone).toEqual(["direct"]);
  });

  it("accepts a connector tool and rejects an action field", () => {
    expect(toolAllowlistEntrySchema.parse({ connector: "google-ads", tool: "query_metrics" }).tool).toBe(
      "query_metrics",
    );
    expect(
      toolAllowlistEntrySchema.safeParse({
        connector: "google-ads",
        tool: "query_metrics",
        action: "create_campaign",
      }).success,
    ).toBe(false);
  });

  it("accepts a skill and rejects an empty instruction", () => {
    expect(skillDefinitionSchema.parse(skill).name).toBe("weekly-performance-review");
    expect(skillDefinitionSchema.safeParse({ ...skill, instructions: "  " }).success).toBe(false);
  });

  it("accepts an observe agent and rejects controlled autonomy", () => {
    const agent = {
      name: "performance-analyst",
      version: "1.0.0",
      goal: "Explain KPI movement.",
      skills: [{ name: "weekly-performance-review", version: "1.0.0" }],
      tools: [{ connector: "mock", tool: "query_metrics" }],
      knowledgeSourceIds: [],
      modelPurpose: "analysis" as const,
      autonomy: "observe" as const,
    };
    expect(agentDefinitionSchema.parse(agent).autonomy).toBe("observe");
    expect(agentDefinitionSchema.safeParse({ ...agent, autonomy: "controlled_autonomy" }).success).toBe(false);
    expect(
      agentDefinitionSchema.safeParse({
        ...agent,
        skills: [
          { name: "weekly-performance-review", version: "1.0.0" },
          { name: "weekly-performance-review", version: "1.0.1" },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts a manual workflow and rejects a write step", () => {
    expect(workflowDefinitionSchema.parse(workflow).steps).toHaveLength(4);
    expect(
      workflowDefinitionSchema.safeParse({
        ...workflow,
        steps: [{ id: "w", kind: "write", tool: "create_issue" }],
      }).success,
    ).toBe(false);
  });

  it("rejects a skill step that reads a later step", () => {
    const steps = workflow.steps.map((step) =>
      step.kind === "run_skill" ? { ...step, inputFrom: ["report"] } : step,
    );
    expect(workflowDefinitionSchema.safeParse({ ...workflow, steps }).success).toBe(false);
  });

  it("rejects a report that reads a later step", () => {
    const steps = [
      { id: "report", kind: "render_report" as const, title: "Weekly review", fromSteps: ["spend"] },
      workflow.steps[1],
    ];
    expect(workflowDefinitionSchema.safeParse({ ...workflow, steps }).success).toBe(false);
  });

  it("rejects a duplicate step id", () => {
    const steps = workflow.steps.map((step, index) => (index === 1 ? { ...step, id: "ctx" } : step));
    expect(workflowDefinitionSchema.safeParse({ ...workflow, steps }).success).toBe(false);
  });

  it("accepts one clock slot and rejects a wildcard or fractional minute", () => {
    const schedule = {
      ...workflow,
      trigger: { type: "schedule" as const, minute: 0, hour: 8, dayOfWeek: 1 },
    };
    expect(workflowDefinitionSchema.parse(schedule).trigger).toEqual({
      type: "schedule",
      minute: 0,
      hour: 8,
      dayOfWeek: 1,
    });
    expect(
      workflowDefinitionSchema.safeParse({
        ...workflow,
        trigger: { type: "schedule", minute: "*", hour: "*", dayOfWeek: "*" },
      }).success,
    ).toBe(false);
    expect(
      workflowDefinitionSchema.safeParse({
        ...workflow,
        trigger: { type: "schedule", minute: 1.5, hour: 8, dayOfWeek: 1 },
      }).success,
    ).toBe(false);
  });

  it("reserves platform prompt names", () => {
    expect(tenantPromptNameSchema.parse("tenant/weekly-review")).toBe("tenant/weekly-review");
    expect(tenantPromptNameSchema.safeParse("ask.plan").success).toBe(false);
    expect(tenantPromptNameSchema.safeParse("ask.answer").success).toBe(false);
  });

  it("accepts a knowledge locator and rejects a URL", () => {
    expect(
      knowledgeSourceSchema.parse({
        name: "brand-notes",
        kind: "notion",
        locator: "page-brand-notes",
      }).kind,
    ).toBe("notion");
    expect(
      knowledgeSourceSchema.safeParse({
        name: "upload",
        kind: "r2_upload",
        locator: "https://example.test/secret",
      }).success,
    ).toBe(false);
    expect(
      knowledgeSourceSchema.parse({
        name: "upload",
        kind: "r2_upload",
        locator: "notes/brand.txt",
      }).locator,
    ).toBe("notes/brand.txt");
    expect(
      knowledgeSourceSchema.safeParse({
        name: "upload",
        kind: "r2_upload",
        locator: "../other-tenant/notes.txt",
      }).success,
    ).toBe(false);
    expect(
      knowledgeSourceSchema.safeParse({
        name: "upload",
        kind: "r2_upload",
        locator: "./secret",
      }).success,
    ).toBe(false);
  });
});
