import { ModelGatewayError, type ModelGateway } from "@marketing-os/model-gateway";
import { resolvePreset } from "@marketing-os/metrics/windows";
import {
  askStreamEventSchema,
  type AskPrimaryRangePreset,
  type AskStreamEvent,
} from "@marketing-os/schemas";
import { answerStage } from "./answer";
import { buildEvidence } from "./evidence";
import { executePlan } from "./execute";
import { planStage } from "./plan";
import type { MetricReader } from "./types";
import { PlanValidationError, type ValidatedPlan } from "./validate";

export type AskRunInput = {
  question: string;
  catalog: readonly string[];
  model: string;
  gateway: ModelGateway;
  reader: MetricReader;
  workspaceId: string;
  runId: string;
  now?: Date;
  labels?: Readonly<Record<string, string>>;
  priorPlan?: ValidatedPlan;
  signal?: AbortSignal;
};

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const err = new Error("The request was aborted");
  err.name = "AbortError";
  throw err;
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function clip(message: string): string {
  const trimmed = message.trim();
  return trimmed.length > 500 ? trimmed.slice(0, 500) : trimmed || "The ask pipeline failed.";
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function rangeFor(plan: ValidatedPlan, now: Date): { preset: AskPrimaryRangePreset; from: string; to: string } {
  const step =
    plan.intent === "answerable"
      ? plan.steps.find((item) => item.tool === "metric_value" || item.tool === "metric_compare")
      : undefined;
  const preset = step && "range" in step ? step.range : "last_30_days";
  const range = resolvePreset(preset, now);
  const from = day(range.start);
  const inclusiveEnd = new Date(range.end.getTime() - 1);
  const to = day(inclusiveEnd);
  return { preset, from, to: from > to ? from : to };
}

function refusalFromPlan(plan: ValidatedPlan): AskStreamEvent {
  if (plan.intent === "out_of_scope") {
    return { type: "refusal", code: "out_of_scope", message: clip(plan.refusalMessage), suggestions: [] };
  }
  if (plan.intent === "needs_clarification") {
    return { type: "refusal", code: "needs_clarification", message: clip(plan.clarification), suggestions: [] };
  }
  if (plan.intent === "unsupported_dimension") {
    return {
      type: "refusal",
      code: "unsupported_dimension",
      message: clip(plan.refusalMessage),
      suggestions: ["Ask for an account total instead."],
    };
  }
  return { type: "refusal", code: "plan_invalid", message: "The plan cannot be answered.", suggestions: [] };
}

function failureEvent(err: unknown): AskStreamEvent {
  if (err instanceof PlanValidationError) {
    return { type: "refusal", code: "plan_invalid", message: clip(err.message), suggestions: [] };
  }
  if (err instanceof ModelGatewayError) {
    if (err.code === "budget_exceeded") {
      return { type: "refusal", code: "budget_exceeded", message: "Monthly model budget exceeded.", suggestions: [] };
    }
    if (err.code === "provider_unavailable" || err.code === "model_not_found") {
      return { type: "refusal", code: "model_unavailable", message: "The model is unavailable.", suggestions: [] };
    }
    if (err.code === "rate_limited") {
      return { type: "error", code: "rate_limited", message: "The model provider rate limited the request." };
    }
    if (err.code === "auth_failed") {
      return { type: "error", code: "model_not_configured", message: "The model provider rejected the API key." };
    }
  }
  return { type: "error", code: "internal_error", message: "The ask pipeline failed." };
}

/** Stream a validated ask run. Abort throws. Gateway failures become a terminal event. */
export async function* runAsk(input: AskRunInput): AsyncGenerator<AskStreamEvent> {
  const now = input.now ?? new Date();
  throwIfAborted(input.signal);
  yield askStreamEventSchema.parse({ type: "stage", stage: "query_plan" });
  let planned;
  try {
    planned = await planStage(input.gateway, {
      question: input.question,
      catalog: input.catalog,
      model: input.model,
      ...(input.priorPlan ? { priorPlan: input.priorPlan } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    });
  } catch (err) {
    if (isAbort(err)) throw err;
    yield askStreamEventSchema.parse(failureEvent(err));
    yield askStreamEventSchema.parse({ type: "done", runId: input.runId });
    return;
  }

  throwIfAborted(input.signal);
  yield askStreamEventSchema.parse({ type: "plan", plan: planned.plan });
  if (planned.plan.intent !== "answerable") {
    yield askStreamEventSchema.parse(refusalFromPlan(planned.plan));
    yield askStreamEventSchema.parse({ type: "done", runId: input.runId });
    return;
  }

  yield askStreamEventSchema.parse({ type: "stage", stage: "validation" });
  const executed = await executePlan(planned.plan, input.reader);
  for (const result of executed.results) {
    yield askStreamEventSchema.parse({ type: "tool_result", result });
  }
  const range = rangeFor(planned.plan, now);
  const evidence = buildEvidence(executed.results, {
    workspaceId: input.workspaceId,
    preset: range.preset,
    from: range.from,
    to: range.to,
    ...(input.labels ? { labels: input.labels } : {}),
  });
  yield askStreamEventSchema.parse({ type: "evidence", evidence });
  if (!evidence.observed.some((fact) => fact.value != null)) {
    yield askStreamEventSchema.parse({
      type: "refusal",
      code: "no_data",
      message: "No tool results for this question.",
      suggestions: ["Connect a source and sync it."],
    });
    yield askStreamEventSchema.parse({ type: "done", runId: input.runId });
    return;
  }

  throwIfAborted(input.signal);
  yield askStreamEventSchema.parse({ type: "stage", stage: "answer" });
  let answered;
  try {
    answered = await answerStage(input.gateway, {
      question: input.question,
      evidence,
      model: input.model,
      ...(input.signal ? { signal: input.signal } : {}),
    });
  } catch (err) {
    if (isAbort(err)) throw err;
    yield askStreamEventSchema.parse(failureEvent(err));
    yield askStreamEventSchema.parse({ type: "done", runId: input.runId });
    return;
  }

  for (const line of answered.answer.observations) {
    yield askStreamEventSchema.parse({ type: "delta", field: "observations", text: line.slice(0, 2000) });
  }
  if (answered.answer.interpretation) {
    yield askStreamEventSchema.parse({
      type: "delta",
      field: "interpretation",
      text: answered.answer.interpretation.slice(0, 2000),
    });
  }
  yield askStreamEventSchema.parse({ type: "answer", answer: answered.answer });
  yield askStreamEventSchema.parse({ type: "done", runId: input.runId });
}
