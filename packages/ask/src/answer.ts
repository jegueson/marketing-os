import type { CompleteRequest, ModelGateway } from "@marketing-os/model-gateway";
import { codePromptRegistry, fenceData } from "@marketing-os/prompts";
import { answerSchema, type Answer, type Evidence, type ObservedFact } from "@marketing-os/schemas";

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const err = new Error("The request was aborted");
  err.name = "AbortError";
  throw err;
}

const PLACEHOLDER = /\{\{([a-zA-Z0-9_]+)\}\}/g;
const BARE_NUMBER = /\d+(?:\.\d+)?%?/g;
const RENDERED_NUMBER = /\d+(?:\.\d+)?/g;

const ANSWER_RESPONSE = {
  type: "json_schema" as const,
  name: "AskAnswerDraft",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["observations", "interpretation"],
    properties: {
      observations: { type: "array", items: { type: "string" } },
      interpretation: { type: "string" },
    },
  },
};

export class AnswerVerificationError extends Error {
  readonly code = "answer_invalid";
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(issues.join("; "));
    this.name = "AnswerVerificationError";
    this.issues = issues;
  }
}

export type AnswerStageResult = {
  promptName: string;
  promptVersion: string;
  repaired: boolean;
  fallback: boolean;
  answer: Answer;
};

type Draft = { observations: string[]; interpretation: string };

function factValues(evidence: Evidence): Map<string, ObservedFact> {
  return new Map(evidence.observed.map((fact) => [fact.ref, fact]));
}

function allowedNumbers(evidence: Evidence): Set<string> {
  const allowed = new Set<string>();
  for (const fact of evidence.observed) {
    if (fact.value != null) allowed.add(String(fact.value));
  }
  return allowed;
}

/** Reject bare numbers and unknown refs before any placeholder is filled. */
export function verifyAnswerText(text: string, evidence: Evidence): void {
  const facts = factValues(evidence);
  const issues: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER)) {
    const ref = match[1] ?? "";
    const fact = facts.get(ref);
    if (!fact) issues.push(`unknown ref ${ref}`);
    else if (fact.value == null) issues.push(`ref ${ref} has no value`);
  }
  const bare = text.replace(PLACEHOLDER, " ").match(BARE_NUMBER) ?? [];
  for (const token of bare) issues.push(`bare number ${token}`);
  if (issues.length > 0) throw new AnswerVerificationError(issues);
}

export function renderAnswerText(text: string, evidence: Evidence): string {
  verifyAnswerText(text, evidence);
  const facts = factValues(evidence);
  return text.replace(PLACEHOLDER, (_match, ref: string) => String(facts.get(ref)?.value));
}

function assertRenderedNumbers(text: string, evidence: Evidence): void {
  const allowed = allowedNumbers(evidence);
  const issues: string[] = [];
  for (const token of text.match(RENDERED_NUMBER) ?? []) {
    if (!allowed.has(token)) issues.push(`number ${token} is not in a tool result`);
  }
  if (issues.length > 0) throw new AnswerVerificationError(issues);
}

function factLines(evidence: Evidence): string[] {
  const lines = evidence.observed
    .filter((fact) => fact.value != null)
    .map((fact) => `${fact.label}: {{${fact.ref}}}`);
  return lines.length > 0 ? lines : ["No tool results."];
}

function refCatalog(evidence: Evidence): string {
  const lines = evidence.observed.map((fact) => `${fact.ref} ${fact.label}`);
  return lines.length > 0 ? lines.join("\n") : "none";
}

function readDraft(content: string): Draft {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new AnswerVerificationError(["model output is not JSON"]);
  }
  if (!raw || typeof raw !== "object") throw new AnswerVerificationError(["model output is not an answer draft"]);
  const draft = raw as { observations?: unknown; interpretation?: unknown };
  const observations = Array.isArray(draft.observations) ? draft.observations.map(String) : [];
  const interpretation = typeof draft.interpretation === "string" ? draft.interpretation : "";
  return { observations, interpretation };
}

function checkDraft(draft: Draft, evidence: Evidence): void {
  verifyAnswerText(draft.observations.join("\n"), evidence);
  verifyAnswerText(draft.interpretation, evidence);
}

function fallbackDraft(evidence: Evidence): Draft {
  return {
    observations: factLines(evidence),
    interpretation: evidence.observed.some((fact) => fact.value != null)
      ? "These figures come from tool results."
      : "No tool results.",
  };
}

function publish(draft: Draft, evidence: Evidence, useFactLines: boolean): Answer {
  const observationSource = useFactLines ? factLines(evidence) : draft.observations;
  const observations = observationSource.map((line) => renderAnswerText(line, evidence));
  const interpretation = renderAnswerText(draft.interpretation, evidence);
  const answer = answerSchema.parse({
    observations,
    interpretation,
    assumptions: evidence.assumptions,
    evidence,
  });
  assertRenderedNumbers(`${answer.observations.join("\n")}\n${answer.interpretation}`, evidence);
  return answer;
}

/** Model cites refs. The server writes observation lines and fills every number from evidence. */
export async function answerStage(
  gateway: ModelGateway,
  input: { question: string; evidence: Evidence; model: string; signal?: AbortSignal },
): Promise<AnswerStageResult> {
  const prompt = codePromptRegistry().get("ask.answer", "1");
  const recorded = { promptName: prompt.name, promptVersion: prompt.version, repaired: false, fallback: false };

  if (!input.evidence.observed.some((fact) => fact.value != null)) {
    const answer = publish(fallbackDraft(input.evidence), input.evidence, true);
    return { ...recorded, fallback: true, answer };
  }

  const rendered = codePromptRegistry().render("ask.answer", "1", {
    question: input.question,
    refs: refCatalog(input.evidence),
  });
  const messages: CompleteRequest["messages"] = [
    { role: "system", content: rendered.system },
    { role: "user", content: rendered.user },
  ];
  const call = (extra: CompleteRequest["messages"] = []) => {
    throwIfAborted(input.signal);
    const next: CompleteRequest = {
      model: input.model,
      messages: [...messages, ...extra],
      temperature: prompt.model.temperatureMax,
      responseFormat: ANSWER_RESPONSE,
    };
    if (input.signal) next.abortSignal = input.signal;
    return gateway.complete(next);
  };

  const accept = (draft: Draft, repaired: boolean, fallback: boolean) => {
    checkDraft(draft, input.evidence);
    return { ...recorded, repaired, fallback, answer: publish(draft, input.evidence, true) };
  };

  const first = await call();
  try {
    return accept(readDraft(first.content), false, false);
  } catch (err) {
    if (!(err instanceof AnswerVerificationError)) throw err;
    const repair = fenceData("repair", "The previous answer used a bare number or an unknown ref. Use only {{ref}} placeholders.");
    const second = await call([
      { role: "assistant", content: first.content },
      { role: "user", content: repair },
    ]);
    try {
      return accept(readDraft(second.content), true, false);
    } catch (repairErr) {
      if (!(repairErr instanceof AnswerVerificationError)) throw repairErr;
      return { ...recorded, repaired: true, fallback: true, answer: publish(fallbackDraft(input.evidence), input.evidence, true) };
    }
  }
}
