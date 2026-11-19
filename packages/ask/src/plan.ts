import type { CompleteRequest, ModelGateway } from "@marketing-os/model-gateway";
import { codePromptRegistry, fenceData } from "@marketing-os/prompts";
import { PlanValidationError, validatePlan, type ValidatedPlan } from "./validate";

const BREAKOUT = /\b(campaigns?|channels?|creatives?)\b/i;
const FOLLOW_UP = /^(what about|how about|and|same)\b/i;

const QUERY_PLAN_RESPONSE = {
  type: "json_schema" as const,
  name: "QueryPlan",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["intent", "steps"],
    properties: {
      intent: {
        enum: ["answerable", "out_of_scope", "needs_clarification", "unsupported_dimension"],
      },
      steps: { type: "array", maxItems: 6 },
    },
  },
};

export type PlanStageResult = {
  promptName: string;
  promptVersion: string;
  repaired: boolean;
  plan: ValidatedPlan;
};

export type PlanStageInput = {
  question: string;
  catalog: readonly string[];
  model: string;
  priorPlan?: ValidatedPlan;
  signal?: AbortSignal;
};

function readPlan(content: string, catalog: readonly string[]): ValidatedPlan {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new PlanValidationError(["model output is not JSON"]);
  }
  return validatePlan(raw, catalog);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const err = new Error("The request was aborted");
  err.name = "AbortError";
  throw err;
}

function request(
  model: string,
  temperature: number,
  messages: CompleteRequest["messages"],
  signal?: AbortSignal,
): CompleteRequest {
  const next: CompleteRequest = {
    model,
    messages,
    temperature,
    responseFormat: QUERY_PLAN_RESPONSE,
  };
  if (signal) next.abortSignal = signal;
  return next;
}

/** One model round on `ask.plan@1`, plus a single repair retry. Breakouts never reach the model. */
export async function planStage(gateway: ModelGateway, input: PlanStageInput): Promise<PlanStageResult> {
  const prompt = codePromptRegistry().get("ask.plan", "1");
  const recorded = { promptName: prompt.name, promptVersion: prompt.version, repaired: false };

  if (BREAKOUT.test(input.question)) {
    return {
      ...recorded,
      plan: validatePlan(
        {
          intent: "unsupported_dimension",
          refusalMessage: "Campaign, channel, and creative breakouts are not available.",
          steps: [],
        },
        input.catalog,
      ),
    };
  }

  if (input.priorPlan && FOLLOW_UP.test(input.question.trim())) {
    return { ...recorded, plan: input.priorPlan };
  }

  throwIfAborted(input.signal);
  const rendered = codePromptRegistry().render("ask.plan", "1", { question: input.question });
  const messages: CompleteRequest["messages"] = [
    { role: "system", content: rendered.system },
    { role: "user", content: rendered.user },
  ];
  const first = await gateway.complete(request(input.model, prompt.model.temperatureMax, messages, input.signal));
  try {
    return { ...recorded, plan: readPlan(first.content, input.catalog) };
  } catch (err) {
    if (!(err instanceof PlanValidationError)) throw err;
    const repair = fenceData("repair", "The previous JSON was not a valid QueryPlan. Return only a QueryPlan.");
    throwIfAborted(input.signal);
    const second = await gateway.complete(
      request(input.model, prompt.model.temperatureMax, [
        ...messages,
        { role: "assistant", content: first.content },
        { role: "user", content: repair },
      ], input.signal),
    );
    return { ...recorded, repaired: true, plan: readPlan(second.content, input.catalog) };
  }
}
