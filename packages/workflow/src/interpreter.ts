import type { ModelGateway } from "@marketing-os/model-gateway";
import { fenceRecord } from "@marketing-os/prompts";
import {
  workflowDefinitionSchema,
  type AskPrimaryRangePreset,
  type BrandProfile,
  type BusinessProfile,
  type SkillDefinition,
  type WorkflowDefinition,
  type WorkflowStep,
} from "@marketing-os/schemas";
import type { WorkflowOutcome, WorkflowReport, WorkflowStepResult } from "./port";

export type WorkflowMetricRange = AskPrimaryRangePreset;

export type WorkflowMetricReader = {
  metricValue(query: {
    tenantId: string;
    workspaceId: string;
    metricKey: string;
    range: WorkflowMetricRange;
  }): Promise<{ metricKey: string; status: "ok" | "no_data"; value: number | null; unit: string | null }>;
  metricCompare(query: {
    tenantId: string;
    workspaceId: string;
    metricKey: string;
    range: WorkflowMetricRange;
  }): Promise<{
    metricKey: string;
    status: "ok" | "no_data";
    current: number | null;
    previous: number | null;
    delta: number | null;
    unit: string | null;
  }>;
};

export type KnowledgeCitation = {
  sourceId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  score: number;
};

export type KnowledgeRetrieveResult = {
  chunks: KnowledgeCitation[];
  deniedSourceIds: string[];
};

export type WorkflowAuditEvent = {
  tenantId: string;
  workspaceId: string;
  eventType: string;
  resourceType?: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
};

/**
 * Sprint 4 never calls connector actions. An action step stops for approval.
 * Tests pass a guard that throws if the connector is invoked.
 */
export type WorkflowRecommendation = {
  tenantId: string;
  workspaceId: string;
  problem: string;
  evidence: string;
  proposedAction: string;
  expectedImpact: string;
  confidence: "low" | "medium" | "high";
  effort: "low" | "medium" | "high";
};

export type WorkflowDeps = {
  model: string;
  gateway: ModelGateway;
  reader: WorkflowMetricReader;
  listActions: () => Promise<unknown>;
  /** External write. Action steps must not call this. */
  executeAction: () => Promise<unknown>;
  /** Threshold steps write one recommendation when the metric is over the line. */
  writeRecommendation: (draft: WorkflowRecommendation) => Promise<void>;
  loadBusinessProfile: (tenantId: string, workspaceId: string) => Promise<BusinessProfile | null>;
  loadBrandProfile: (tenantId: string, workspaceId: string) => Promise<BrandProfile | null>;
  loadPublishedSkill: (
    tenantId: string,
    workspaceId: string,
    name: string,
    version: string,
  ) => Promise<SkillDefinition | null>;
  /** Tenant-scoped knowledge retrieval. Foreign source ids must yield no text. */
  retrieveKnowledge: (input: {
    tenantId: string;
    workspaceId: string;
    sourceIds: string[];
    query: string;
  }) => Promise<KnowledgeRetrieveResult>;
  /** Audit sink for denied foreign knowledge sources (and future step events). */
  recordAudit: (event: WorkflowAuditEvent) => Promise<void>;
};

export type InterpretScope = {
  tenantId: string;
  workspaceId: string;
  deps: WorkflowDeps;
};

/**
 * Durable step boundary. Cloudflare Workflows pass `step.do`.
 * Tests and the in-memory path use the identity runner.
 */
export type WorkflowStepDo = <T>(name: string, fn: () => Promise<T>) => Promise<T>;

export type InterpretOptions = {
  runStep?: WorkflowStepDo;
};

const KNOWN_ERROR_CODES = new Set([
  "invalid_definition",
  "trigger_not_active",
  "unsupported_step",
  "skill_not_found",
  "skill_output_invalid",
  "step_failed",
]);

function failed(errorCode: string, steps: WorkflowStepResult[] = []): WorkflowOutcome {
  return { status: "failed", errorCode, steps, report: null };
}

function asData(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "null";
  try {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? "null" : encoded;
  } catch {
    return "[unserializable]";
  }
}

function resolveErrorCode(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    KNOWN_ERROR_CODES.has(error.code)
  ) {
    return error.code;
  }
  return "step_failed";
}

async function loadContext(
  step: Extract<WorkflowStep, { kind: "load_context" }>,
  scope: InterpretScope,
): Promise<unknown> {
  // Plain object: Cloudflare step.do must RPC-serialize the return value.
  const output: Record<string, unknown> = {};
  if (step.include.includes("business_profile")) {
    output.business_profile = await scope.deps.loadBusinessProfile(scope.tenantId, scope.workspaceId);
  }
  if (step.include.includes("brand_profile")) {
    output.brand_profile = await scope.deps.loadBrandProfile(scope.tenantId, scope.workspaceId);
  }
  return output;
}

async function readMetrics(
  step: Extract<WorkflowStep, { kind: "read_metrics" }>,
  scope: InterpretScope,
): Promise<unknown> {
  if (step.compareToPrevious) {
    const compared = await scope.deps.reader.metricCompare({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      metricKey: step.metricKey,
      range: step.range,
    });
    return {
      metricKey: compared.metricKey,
      status: compared.status,
      value: compared.current,
      current: compared.current,
      previous: compared.previous,
      delta: compared.delta,
      unit: compared.unit,
    };
  }
  return scope.deps.reader.metricValue({
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    metricKey: step.metricKey,
    range: step.range,
  });
}

async function retrieveKnowledgeStep(
  step: Extract<WorkflowStep, { kind: "retrieve_knowledge" }>,
  scope: InterpretScope,
): Promise<{ chunks: KnowledgeCitation[] }> {
  const result = await scope.deps.retrieveKnowledge({
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    sourceIds: step.sourceIds,
    query: step.query,
  });
  for (const sourceId of result.deniedSourceIds) {
    await scope.deps.recordAudit({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      eventType: "knowledge.foreign_source_denied",
      resourceType: "knowledge_source",
      resourceId: sourceId,
      payload: { sourceId, query: step.query },
    });
  }
  return { chunks: result.chunks };
}

async function runSkill(
  step: Extract<WorkflowStep, { kind: "run_skill" }>,
  scope: InterpretScope,
  prior: Map<string, { kind: WorkflowStep["kind"]; output: unknown }>,
): Promise<unknown> {
  const skill = await scope.deps.loadPublishedSkill(
    scope.tenantId,
    scope.workspaceId,
    step.skill,
    step.version,
  );
  if (!skill) {
    throw Object.assign(new Error(`Skill ${step.skill}@${step.version} is not published`), {
      code: "skill_not_found",
    });
  }
  const context: Record<string, string> = {};
  for (const stepId of step.inputFrom) {
    context[stepId] = asData(prior.get(stepId)?.output ?? null);
  }
  const user = fenceRecord(context);
  const response = await scope.deps.gateway.complete({
    model: scope.deps.model,
    messages: [
      { role: "system", content: skill.instructions },
      { role: "user", content: user },
    ],
    maxTokens: 2048,
  });
  if (response.finishReason !== "stop") {
    throw Object.assign(new Error(`Skill completion finished with ${response.finishReason}`), {
      code: "skill_output_invalid",
    });
  }
  try {
    return JSON.parse(response.content) as unknown;
  } catch {
    return { text: response.content };
  }
}

function formatMetricOutput(output: unknown): string {
  if (output === null || typeof output !== "object") return "metric: n/a";
  const metric = output as {
    metricKey?: unknown;
    value?: unknown;
    current?: unknown;
    unit?: unknown;
  };
  const key = typeof metric.metricKey === "string" ? metric.metricKey : "metric";
  const raw = metric.value ?? metric.current;
  const value = typeof raw === "number" ? String(raw) : "n/a";
  const unit = typeof metric.unit === "string" && metric.unit.length > 0 ? ` ${metric.unit}` : "";
  return `${key}: ${value}${unit}`;
}

function formatSkillOutput(output: unknown): string {
  if (output !== null && typeof output === "object" && "summary" in output) {
    const summary = (output as { summary: unknown }).summary;
    return typeof summary === "string" ? summary : asData(summary);
  }
  if (typeof output === "string") return output;
  return asData(output);
}

function formatKnowledgeOutput(output: unknown): string {
  if (output === null || typeof output !== "object" || !("chunks" in output)) {
    return "knowledge: []";
  }
  const chunks = (output as { chunks: unknown }).chunks;
  if (!Array.isArray(chunks) || chunks.length === 0) return "knowledge: []";
  return chunks
    .map((chunk) => {
      if (chunk && typeof chunk === "object" && "content" in chunk) {
        return String((chunk as { content: unknown }).content);
      }
      return asData(chunk);
    })
    .join("\n");
}

function formatStepOutput(stepId: string, entry: { kind: WorkflowStep["kind"]; output: unknown } | undefined): string {
  if (!entry) return `${stepId}: missing`;
  switch (entry.kind) {
    case "read_metrics":
      return formatMetricOutput(entry.output);
    case "run_skill":
      return formatSkillOutput(entry.output);
    case "retrieve_knowledge":
      return formatKnowledgeOutput(entry.output);
    case "render_report":
      return typeof entry.output === "object" && entry.output && "body" in entry.output
        ? String((entry.output as WorkflowReport).body)
        : asData(entry.output);
    default:
      return `${stepId}: ${asData(entry.output)}`;
  }
}

/** Writes the fixture recommendation only when the metric is strictly over the line. */
async function runThreshold(
  step: Extract<WorkflowStep, { kind: "threshold" }>,
  scope: InterpretScope,
): Promise<{ fired: boolean }> {
  const reading = await scope.deps.reader.metricValue({
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    metricKey: step.metricKey,
    range: "last_30_days",
  });
  if (reading.status !== "ok" || reading.value == null || reading.value <= step.above) {
    return { fired: false };
  }
  const problem =
    step.metricKey === "mock.spend" ? "Spend rose without a lead change." : `${step.metricKey} crossed the threshold.`;
  await scope.deps.writeRecommendation({
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    problem,
    evidence: `${step.metricKey} is ${reading.value}.`,
    proposedAction: "Review the spend change.",
    expectedImpact: "The specialist gets one tracked task.",
    confidence: "medium",
    effort: "low",
  });
  return { fired: true };
}

function renderReport(
  step: Extract<WorkflowStep, { kind: "render_report" }>,
  prior: Map<string, { kind: WorkflowStep["kind"]; output: unknown }>,
): WorkflowReport {
  const lines = step.fromSteps.map((stepId) => formatStepOutput(stepId, prior.get(stepId)));
  return { title: step.title, body: lines.join("\n") };
}

/**
 * Runs one published definition in-process.
 * An action step stops in awaiting_approval and does not call the connector.
 * Pass `runStep: (name, fn) => step.do(name, fn)` from Cloudflare Workflows.
 */
export async function interpretWorkflow(
  definition: WorkflowDefinition,
  scope: InterpretScope,
  options: InterpretOptions = {},
): Promise<WorkflowOutcome> {
  const runStep: WorkflowStepDo = options.runStep ?? (async (_name, fn) => fn());
  const parsed = workflowDefinitionSchema.safeParse(definition);
  if (!parsed.success) {
    return failed("invalid_definition");
  }

  const steps: WorkflowStepResult[] = [];
  const prior = new Map<string, { kind: WorkflowStep["kind"]; output: unknown }>();
  let report: WorkflowReport | null = null;

  for (const step of parsed.data.steps) {
    try {
      const output = await runStep(step.id, async () => {
        switch (step.kind) {
          case "load_context":
            return loadContext(step, scope);
          case "read_metrics":
            return readMetrics(step, scope);
          case "retrieve_knowledge":
            return retrieveKnowledgeStep(step, scope);
          case "run_skill":
            return runSkill(step, scope, prior);
          case "render_report":
            return { ...renderReport(step, prior) };
          case "action":
            return { status: "awaiting_approval" as const, connector: step.connector, tool: step.tool };
          case "threshold":
            return runThreshold(step, scope);
          default: {
            const _exhaustive: never = step;
            throw Object.assign(new Error(`Unsupported step ${JSON.stringify(_exhaustive)}`), {
              code: "unsupported_step",
            });
          }
        }
      });
      // Capture after runStep so Cloudflare step replay still sets the report.
      if (step.kind === "render_report") {
        report = output as WorkflowReport;
      }
      prior.set(step.id, { kind: step.kind, output });
      steps.push({ stepId: step.id, kind: step.kind, status: "ok", output, errorCode: null });
      if (step.kind === "action") {
        return { status: "awaiting_approval", errorCode: null, steps, report };
      }
    } catch (error) {
      const errorCode = resolveErrorCode(error);
      steps.push({
        stepId: step.id,
        kind: step.kind,
        status: "error",
        output: null,
        errorCode,
      });
      return { status: "failed", errorCode, steps, report: null };
    }
  }

  return { status: "succeeded", errorCode: null, steps, report };
}
