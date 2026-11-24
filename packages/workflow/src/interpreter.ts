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

/**
 * Sprint 4 never calls connector actions. Tests pass a guard that throws if invoked.
 */
export type WorkflowDeps = {
  model: string;
  gateway: ModelGateway;
  reader: WorkflowMetricReader;
  listActions: () => Promise<unknown>;
  loadBusinessProfile: (tenantId: string, workspaceId: string) => Promise<BusinessProfile | null>;
  loadBrandProfile: (tenantId: string, workspaceId: string) => Promise<BrandProfile | null>;
  loadPublishedSkill: (
    tenantId: string,
    workspaceId: string,
    name: string,
    version: string,
  ) => Promise<SkillDefinition | null>;
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

function formatStepOutput(stepId: string, entry: { kind: WorkflowStep["kind"]; output: unknown } | undefined): string {
  if (!entry) return `${stepId}: missing`;
  switch (entry.kind) {
    case "read_metrics":
      return formatMetricOutput(entry.output);
    case "run_skill":
      return formatSkillOutput(entry.output);
    case "render_report":
      return typeof entry.output === "object" && entry.output && "body" in entry.output
        ? String((entry.output as WorkflowReport).body)
        : asData(entry.output);
    default:
      return `${stepId}: ${asData(entry.output)}`;
  }
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
 * Schedule triggers fail closed. Connector actions are never invoked.
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
  if (parsed.data.trigger.type === "schedule") {
    return failed("trigger_not_active");
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
            // Chunks arrive in S4-T16. Until then the step succeeds with an empty list.
            return { chunks: [] };
          case "run_skill":
            return runSkill(step, scope, prior);
          case "render_report":
            return { ...renderReport(step, prior) };
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
