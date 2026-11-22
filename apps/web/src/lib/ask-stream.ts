import { askStreamEventSchema, type AskStreamEvent, type Answer, type Evidence, type QueryPlan, type ToolResult } from "@marketing-os/schemas";

export class AskStreamParseError extends Error {
  readonly code = "malformed_event";

  constructor(message: string) {
    super(message);
    this.name = "AskStreamParseError";
  }
}

export type AskRunStatus = "idle" | "streaming" | "done" | "refused" | "error" | "aborted";

export type AskRunState = {
  status: AskRunStatus;
  stage: Extract<AskStreamEvent, { type: "stage" }>["stage"] | null;
  plan: QueryPlan | null;
  toolResults: ToolResult[];
  evidence: Evidence | null;
  observations: string[];
  interpretation: string[];
  answer: Answer | null;
  refusal: { code: string; message: string; suggestions: string[] } | null;
  error: { code: string; message: string } | null;
  runId: string | null;
};

export function initialAskRun(): AskRunState {
  return {
    status: "idle",
    stage: null,
    plan: null,
    toolResults: [],
    evidence: null,
    observations: [],
    interpretation: [],
    answer: null,
    refusal: null,
    error: null,
    runId: null,
  };
}

function statusAfter(current: AskRunStatus, event: AskStreamEvent): AskRunStatus {
  if (event.type === "refusal") return "refused";
  if (event.type === "error") return "error";
  if (event.type === "done") return current === "refused" || current === "error" ? current : "done";
  if (current === "idle") return "streaming";
  return current;
}

/** Fold one validated event into a new state. Does not mutate `state`. */
export function reduceAskEvent(state: AskRunState, event: AskStreamEvent): AskRunState {
  const parsed = askStreamEventSchema.parse(event);
  const next = { ...state, status: statusAfter(state.status, parsed) };
  switch (parsed.type) {
    case "stage":
      return { ...next, stage: parsed.stage };
    case "plan":
      return { ...next, plan: parsed.plan };
    case "tool_result":
      return { ...next, toolResults: [...state.toolResults, parsed.result] };
    case "evidence":
      return { ...next, evidence: parsed.evidence };
    case "delta":
      return parsed.field === "observations"
        ? { ...next, observations: [...state.observations, parsed.text] }
        : { ...next, interpretation: [...state.interpretation, parsed.text] };
    case "answer":
      return { ...next, answer: parsed.answer };
    case "refusal":
      return {
        ...next,
        refusal: { code: parsed.code, message: parsed.message, suggestions: [...parsed.suggestions] },
      };
    case "error":
      return { ...next, error: { code: parsed.code, message: parsed.message } };
    case "done":
      return { ...next, runId: parsed.runId };
    default:
      return next;
  }
}

function eventFromBlock(block: string): AskStreamEvent | null {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).replace(/^ /, ""))
    .join("\n");
  if (!data) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    throw new AskStreamParseError("Ask event is not JSON");
  }
  const parsed = askStreamEventSchema.safeParse(raw);
  if (!parsed.success) throw new AskStreamParseError("Ask event did not match AskStreamEvent");
  return parsed.data;
}

/** Parse complete SSE blocks. `buffer` keeps a trailing partial frame. */
export function readAskSse(buffer: string, chunk: string): { events: AskStreamEvent[]; buffer: string } {
  const parts = `${buffer}${chunk}`.split(/\r?\n\r?\n/);
  const rest = parts.pop() ?? "";
  const events: AskStreamEvent[] = [];
  for (const part of parts) {
    const event = eventFromBlock(part);
    if (event) events.push(event);
  }
  return { events, buffer: rest };
}

/** Read an SSE body until it ends or `signal` aborts. Malformed frames throw. */
export async function consumeAskStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AskStreamEvent) => void,
  signal?: AbortSignal,
): Promise<"done" | "aborted"> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  if (signal) signal.addEventListener("abort", cancel, { once: true });
  try {
    while (!signal?.aborted) {
      const { done, value } = await reader.read();
      if (signal?.aborted) return "aborted";
      if (done) break;
      const parsed = readAskSse(buffer, decoder.decode(value, { stream: true }));
      buffer = parsed.buffer;
      for (const event of parsed.events) onEvent(event);
    }
    if (signal?.aborted) return "aborted";
    if (buffer.trim()) {
      const parsed = readAskSse(buffer, "\n\n");
      for (const event of parsed.events) onEvent(event);
    }
    return "done";
  } catch (err) {
    if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) return "aborted";
    throw err;
  } finally {
    if (signal) signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
