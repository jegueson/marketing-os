import { askMetricKeySchema, askPrimaryRangePresetSchema } from "./ask";
import { z } from "./zod";

/** Kebab-case identifier. Connector slugs such as `google-ads` fit. */
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/)
  .openapi("ConfigSlug");

const semverSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)
  .openapi("ConfigSemver");

const stepIdSchema = z.string().trim().min(1).max(40);

const riskClassSchema = z.enum(["low", "medium", "high"]).openapi("RiskClass");

/**
 * A connector read tool. Actions are a different list and must not appear here.
 * Sprint 5 is the first sprint that may name an action.
 */
export const toolAllowlistEntrySchema = z
  .object({
    connector: slugSchema,
    tool: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/),
  })
  .strict()
  .openapi("ToolAllowlistEntry");

const skillFieldSchema = z
  .object({
    name: z
      .string()
      .trim()
      .regex(/^[a-z][a-zA-Z0-9]{0,40}$/),
    type: z.enum(["string", "number", "boolean", "integer"]),
    description: z.string().trim().min(1).max(200),
    required: z.boolean(),
  })
  .strict()
  .openapi("SkillField");

const skillContextKeySchema = z
  .enum(["business_profile", "brand_profile", "metrics", "knowledge"])
  .openapi("SkillContextKey");

const uniqueFieldNames = (fields: { name: string }[], ctx: z.RefinementCtx, path: string) => {
  const seen = new Set<string>();
  for (const field of fields) {
    if (seen.has(field.name)) {
      ctx.addIssue({ code: "custom", message: `duplicate field: ${field.name}`, path: [path] });
      continue;
    }
    seen.add(field.name);
  }
};

export const businessProfileSchema = z
  .object({
    companyDescription: z.string().trim().min(1).max(4000),
    businessModel: z.string().trim().min(1).max(500),
    products: z.array(z.string().trim().min(1).max(200)).max(50),
    markets: z.array(z.string().trim().min(1).max(200)).max(50),
    businessGoals: z.array(z.string().trim().min(1).max(500)).max(20),
    marketingGoals: z.array(z.string().trim().min(1).max(500)).max(20),
    primaryKpis: z.array(askMetricKeySchema).max(30),
    reportingCadence: z.enum(["daily", "weekly", "monthly"]),
  })
  .strict()
  .openapi("BusinessProfile");

export const brandProfileSchema = z
  .object({
    positioning: z.string().trim().min(1).max(2000),
    audience: z.string().trim().min(1).max(2000),
    tone: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
    preferredTerms: z.array(z.string().trim().min(1).max(80)).max(100),
    bannedTerms: z.array(z.string().trim().min(1).max(80)).max(100),
    visualGuidance: z.string().trim().max(2000).optional(),
    approvedClaims: z.array(z.string().trim().min(1).max(500)).max(50),
    prohibitedClaims: z.array(z.string().trim().min(1).max(500)).max(50),
    marketLanguage: z.array(z.string().trim().min(2).max(40)).max(20),
    exampleAssetIds: z.array(z.string().uuid()).max(20),
  })
  .strict()
  .openapi("BrandProfile");

export const skillDefinitionSchema = z
  .object({
    name: slugSchema,
    version: semverSchema,
    description: z.string().trim().min(1).max(500),
    domain: z.enum(["performance", "organic", "retention", "leads", "brand", "reporting"]),
    inputs: z.array(skillFieldSchema).max(20),
    contextRequirements: z.array(skillContextKeySchema).max(4),
    tools: z.array(toolAllowlistEntrySchema).max(20),
    instructions: z.string().trim().min(1).max(8000),
    outputs: z.array(skillFieldSchema).min(1).max(20),
    evaluationSuite: z.string().trim().min(1).max(80).nullable(),
    riskClass: riskClassSchema,
  })
  .strict()
  .superRefine((skill, ctx) => {
    uniqueFieldNames(skill.inputs, ctx, "inputs");
    uniqueFieldNames(skill.outputs, ctx, "outputs");
  })
  .openapi("SkillDefinition");

const skillRefSchema = z
  .object({
    name: slugSchema,
    version: semverSchema,
  })
  .strict()
  .openapi("SkillRef");

/**
 * Sprint 4 agents observe. `controlled_autonomy` is not a member of this enum.
 * Sprint 5 adds it when an approval policy can gate a write.
 */
export const agentDefinitionSchema = z
  .object({
    name: slugSchema,
    version: semverSchema,
    goal: z.string().trim().min(1).max(1000),
    skills: z.array(skillRefSchema).min(1).max(10),
    tools: z.array(toolAllowlistEntrySchema).max(20),
    knowledgeSourceIds: z.array(z.string().uuid()).max(20),
    modelPurpose: z.enum(["analysis", "drafting"]),
    autonomy: z.literal("observe"),
  })
  .strict()
  .superRefine((agent, ctx) => {
    const seen = new Set<string>();
    for (const skill of agent.skills) {
      if (seen.has(skill.name)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate skill: ${skill.name}`,
          path: ["skills"],
        });
        return;
      }
      seen.add(skill.name);
    }
  })
  .openapi("AgentDefinition");

const loadContextStepSchema = z
  .object({
    id: stepIdSchema,
    kind: z.literal("load_context"),
    include: z.array(z.enum(["business_profile", "brand_profile"])).min(1).max(2),
  })
  .strict();

const readMetricsStepSchema = z
  .object({
    id: stepIdSchema,
    kind: z.literal("read_metrics"),
    metricKey: askMetricKeySchema,
    range: askPrimaryRangePresetSchema,
    compareToPrevious: z.boolean(),
  })
  .strict();

const retrieveKnowledgeStepSchema = z
  .object({
    id: stepIdSchema,
    kind: z.literal("retrieve_knowledge"),
    sourceIds: z.array(z.string().uuid()).max(20),
    query: z.string().trim().min(1).max(500),
  })
  .strict();

const runSkillStepSchema = z
  .object({
    id: stepIdSchema,
    kind: z.literal("run_skill"),
    skill: slugSchema,
    version: semverSchema,
    inputFrom: z.array(stepIdSchema).max(12),
  })
  .strict();

const renderReportStepSchema = z
  .object({
    id: stepIdSchema,
    kind: z.literal("render_report"),
    title: z.string().trim().min(1).max(200),
    fromSteps: z.array(stepIdSchema).min(1).max(12),
  })
  .strict();

const actionStepSchema = z
  .object({
    id: stepIdSchema,
    kind: z.literal("action"),
    connector: slugSchema,
    tool: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/),
  })
  .strict();

const thresholdStepSchema = z
  .object({
    id: stepIdSchema,
    kind: z.literal("threshold"),
    metricKey: askMetricKeySchema,
    above: z.number().finite(),
  })
  .strict();

export const workflowStepSchema = z
  .discriminatedUnion("kind", [
    loadContextStepSchema,
    readMetricsStepSchema,
    retrieveKnowledgeStepSchema,
    runSkillStepSchema,
    renderReportStepSchema,
    actionStepSchema,
    thresholdStepSchema,
  ])
  .openapi("WorkflowStep");

const manualTriggerSchema = z.object({ type: z.literal("manual") }).strict();

/** One clock slot. A wildcard minute would allow a run every minute, so the minute is an integer. */
const scheduleTriggerSchema = z
  .object({
    type: z.literal("schedule"),
    minute: z.number().int().min(0).max(59),
    hour: z.number().int().min(0).max(23),
    dayOfWeek: z.union([z.literal("*"), z.number().int().min(0).max(6)]),
  })
  .strict();

export const workflowTriggerSchema = z
  .discriminatedUnion("type", [manualTriggerSchema, scheduleTriggerSchema])
  .openapi("WorkflowTrigger");

const uniqueStepIds = (steps: { id: string }[], ctx: z.RefinementCtx): boolean => {
  const seen = new Set<string>();
  let unique = true;
  for (const step of steps) {
    if (seen.has(step.id)) {
      unique = false;
      ctx.addIssue({ code: "custom", message: `duplicate step id: ${step.id}`, path: ["steps"] });
      continue;
    }
    seen.add(step.id);
  }
  return unique;
};

/** A step may read only steps that already ran. Forward references would hide a cycle. */
const assertEarlierSteps = (
  steps: { id: string }[],
  stepIndex: number,
  refs: readonly string[],
  ctx: z.RefinementCtx,
  path: (string | number)[],
) => {
  for (const ref of refs) {
    const refIndex = steps.findIndex((step) => step.id === ref);
    if (refIndex < 0 || refIndex >= stepIndex) {
      ctx.addIssue({
        code: "custom",
        message: `step ${steps[stepIndex]?.id ?? stepIndex} cannot read ${ref}`,
        path,
      });
    }
  }
};

export const workflowDefinitionSchema = z
  .object({
    name: slugSchema,
    version: semverSchema,
    description: z.string().trim().min(1).max(500),
    trigger: workflowTriggerSchema,
    steps: z.array(workflowStepSchema).min(1).max(12),
  })
  .strict()
  .superRefine((workflow, ctx) => {
    if (!uniqueStepIds(workflow.steps, ctx)) {
      return;
    }
    workflow.steps.forEach((step, index) => {
      if (step.kind === "run_skill") {
        assertEarlierSteps(workflow.steps, index, step.inputFrom, ctx, ["steps", index, "inputFrom"]);
      }
      if (step.kind === "render_report") {
        assertEarlierSteps(workflow.steps, index, step.fromSteps, ctx, ["steps", index, "fromSteps"]);
      }
    });
  })
  .openapi("WorkflowDefinition");

/** Tenant prompts cannot use the platform catalog names (`ask.plan`, `ask.answer`). */
export const tenantPromptNameSchema = z
  .string()
  .trim()
  .regex(/^tenant\/[a-z][a-z0-9]*(-[a-z0-9]+)*$/)
  .openapi("TenantPromptName");

/**
 * Bare object key or page id. Only ASCII letters, digits, `.`, `_`, `-`, and `/` between
 * segments. A scheme, `..`, or a leading dot would point outside the tenant prefix.
 */
const knowledgeLocatorSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,127})*$/, {
    message: "locator must be a bare key",
  });

export const knowledgeSourceSchema = z
  .object({
    name: slugSchema,
    kind: z.enum(["notion", "r2_upload"]),
    locator: knowledgeLocatorSchema,
  })
  .strict()
  .openapi("KnowledgeSource");

export type BusinessProfile = z.infer<typeof businessProfileSchema>;
export type BrandProfile = z.infer<typeof brandProfileSchema>;
export type ToolAllowlistEntry = z.infer<typeof toolAllowlistEntrySchema>;
export type SkillDefinition = z.infer<typeof skillDefinitionSchema>;
export type AgentDefinition = z.infer<typeof agentDefinitionSchema>;
export type RiskClass = z.infer<typeof riskClassSchema>;
export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export type WorkflowTrigger = z.infer<typeof workflowTriggerSchema>;
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type TenantPromptName = z.infer<typeof tenantPromptNameSchema>;
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;
