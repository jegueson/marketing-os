import { describe, expect, it, vi } from "vitest";
import { askStreamEventSchema, type AskStreamEvent } from "@marketing-os/schemas";
import { consumeAskStream, initialAskRun, readAskSse, reduceAskEvent, AskStreamParseError } from "./ask-stream";

const runId = "00000000-0000-4000-8000-000000000099";

const evidence = {
  sources: [
    {
      connectionId: "00000000-0000-4000-8000-000000000001",
      connector: "mock",
      displayName: "Mock",
    },
  ],
  range: { preset: "last_30_days" as const, from: "2026-10-14", to: "2026-11-13", label: "Last 30 days" },
  filters: { workspaceId: "00000000-0000-4000-8000-000000000002" },
  freshness: "live" as const,
  qualityWarnings: [] as string[],
  assumptions: ["Values are UTC window aggregates."],
  definitions: [{ key: "mock.spend", version: "1", label: "Spend" }],
  observed: [
    {
      ref: "spend",
      stepId: "s1",
      label: "Spend",
      value: 2550,
      unit: "EUR",
      definitionKey: "mock.spend",
      definitionVersion: "1",
    },
  ],
};

const events = [
  { type: "stage" as const, stage: "query_plan" as const },
  { type: "plan" as const, plan: { intent: "answerable" as const, steps: [{ id: "s1", tool: "metric_value" as const, metricKey: "mock.spend", range: "last_30_days" as const }] } },
  { type: "tool_result" as const, result: { stepId: "s1", tool: "list_metrics" as const, status: "ok" as const, metrics: [] } },
  { type: "evidence" as const, evidence },
  { type: "delta" as const, field: "observations" as const, text: "Spend: {{spend}}" },
  { type: "delta" as const, field: "interpretation" as const, text: "Within range." },
  {
    type: "answer" as const,
    answer: {
      observations: ["Spend was {{spend}}."],
      interpretation: "Within range.",
      assumptions: ["UTC"],
      evidence,
    },
  },
  { type: "refusal" as const, code: "no_data" as const, message: "No tool results.", suggestions: ["Sync a source."] },
  { type: "error" as const, code: "rate_limited" as const, message: "Slow down." },
  { type: "done" as const, runId },
].map((event) => askStreamEventSchema.parse(event));

describe("ask stream reducer", () => {
  it("records every AskStreamEvent type", () => {
    let state = initialAskRun();
    const [stage, plan, tool, evidenceEvent, observation, interpretation, answer, refusal, error, done] = events;
    if (!stage || !plan || !tool || !evidenceEvent || !observation || !interpretation || !answer || !refusal || !error || !done) {
      throw new Error("missing fixture");
    }
    state = reduceAskEvent(state, stage);
    expect(state.stage).toBe("query_plan");
    expect(state.status).toBe("streaming");
    state = reduceAskEvent(state, plan);
    expect(state.plan).toMatchObject({ intent: "answerable" });
    state = reduceAskEvent(state, tool);
    expect(state.toolResults).toHaveLength(1);
    expect(state.toolResults[0]).toMatchObject({ tool: "list_metrics", status: "ok" });
    state = reduceAskEvent(state, evidenceEvent);
    expect(state.evidence?.observed[0]).toMatchObject({ ref: "spend", value: 2550 });
    state = reduceAskEvent(state, observation);
    state = reduceAskEvent(state, interpretation);
    expect(state.observations).toEqual(["Spend: {{spend}}"]);
    expect(state.interpretation).toEqual(["Within range."]);
    state = reduceAskEvent(state, answer);
    expect(state.answer?.observations).toEqual(["Spend was {{spend}}."]);
    state = reduceAskEvent(state, refusal);
    expect(state.status).toBe("refused");
    expect(state.refusal).toMatchObject({ code: "no_data", suggestions: ["Sync a source."] });
    state = reduceAskEvent(state, error);
    expect(state.status).toBe("error");
    expect(state.error).toEqual({ code: "rate_limited", message: "Slow down." });
    state = reduceAskEvent(state, done);
    expect(state.status).toBe("error");
    expect(state.runId).toBe(runId);
    expect(state.toolResults).toHaveLength(1);
  });

  it("rejects malformed JSON and events that are not AskStreamEvent", () => {
    expect(() => readAskSse("", "data: {not json}\n\n")).toThrow(AskStreamParseError);
    expect(() => readAskSse("", 'data: {"type":"sql","query":"select 1"}\n\n')).toThrow(AskStreamParseError);
    const partial = readAskSse("", 'data: {"type":"sta');
    expect(partial.events).toEqual([]);
    const done = readAskSse(partial.buffer, 'ge","stage":"validation"}\n\n');
    expect(done.events).toEqual([{ type: "stage", stage: "validation" }]);
  });

  it("stops reading when the abort signal fires", async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(encoder.encode('data: {"type":"stage","stage":"query_plan"}\n\n'));
        controller.signal.addEventListener("abort", () => {
          stream.error(Object.assign(new Error("The request was aborted"), { name: "AbortError" }));
        });
      },
    });
    const seen: AskStreamEvent[] = [];
    const pending = consumeAskStream(body, (event) => seen.push(event), controller.signal);
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    controller.abort();
    await expect(pending).resolves.toBe("aborted");
    expect(seen[0]).toEqual({ type: "stage", stage: "query_plan" });
  });
});
