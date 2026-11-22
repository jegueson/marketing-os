/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { askStreamEventSchema, type AskStreamEvent } from "@marketing-os/schemas";
import { initialAskRun, reduceAskEvent } from "../lib/ask-stream";
import { AskAnswerPanel } from "./ask-answer-panel";

const evidence = {
  sources: [
    {
      connectionId: "00000000-0000-4000-8000-000000000001",
      connector: "mock",
      displayName: "Mock",
    },
  ],
  range: { preset: "last_30_days" as const, from: "2026-03-02", to: "2026-03-31", label: "Last 30 days" },
  filters: { workspaceId: "00000000-0000-4000-8000-000000000002" },
  freshness: "live" as const,
  qualityWarnings: ["partial coverage"],
  assumptions: ["Values are UTC window aggregates."],
  definitions: [{ key: "mock.spend", version: "1", label: "Spend" }],
  observed: [
    {
      ref: "o1",
      stepId: "s1",
      label: "Spend",
      value: 2550,
      unit: "EUR",
      definitionKey: "mock.spend",
      definitionVersion: "1",
    },
  ],
};

function parse(event: unknown): AskStreamEvent {
  return askStreamEventSchema.parse(event);
}

const answered = [
  parse({ type: "stage", stage: "query_plan" }),
  parse({
    type: "plan",
    plan: {
      intent: "answerable",
      steps: [{ id: "s1", tool: "metric_value", metricKey: "mock.spend", range: "last_30_days" }],
    },
  }),
  parse({ type: "stage", stage: "validation" }),
  parse({
    type: "tool_result",
    result: {
      stepId: "s1",
      tool: "metric_value",
      status: "ok",
      value: 2550,
      unit: "EUR",
      definitionKey: "mock.spend",
      definitionVersion: "1",
      source: "mock",
      fetchedAt: "2026-04-01T15:00:00.000Z",
    },
  }),
  parse({ type: "evidence", evidence }),
  parse({ type: "stage", stage: "answer" }),
  parse({ type: "delta", field: "observations", text: "Spend: 2550" }),
  parse({ type: "delta", field: "interpretation", text: "Within the selected range." }),
  parse({
    type: "answer",
    answer: {
      observations: ["Spend: 2550"],
      interpretation: "Within the selected range.",
      assumptions: ["Values are UTC window aggregates."],
      evidence,
    },
  }),
  parse({ type: "done", runId: "00000000-0000-4000-8000-000000000099" }),
].reduce(reduceAskEvent, initialAskRun());

describe("ask answer panel", () => {
  afterEach(() => cleanup());

  it("shows the mock spend answer in separate regions with evidence and no SQL", () => {
    render(<AskAnswerPanel state={answered} />);
    expect(within(screen.getByRole("region", { name: "Observed" })).getByText("Spend: 2550")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Interpretation" })).getByText("Within the selected range.")).toBeTruthy();
    const evidenceRegion = screen.getByRole("region", { name: "Evidence" });
    expect(within(evidenceRegion).getByText("Spend: 2550")).toBeTruthy();
    expect(within(evidenceRegion).getByText("mock.spend@1")).toBeTruthy();
    expect(within(evidenceRegion).getByRole("list", { name: "Warnings" }).textContent).toContain("partial coverage");
    const plan = screen.getByRole("region", { name: "Query plan" });
    expect(within(plan).getByText(/metric_value mock.spend/)).toBeTruthy();
    expect(within(plan).queryByRole("textbox")).toBeNull();
    expect(plan.textContent?.toLowerCase()).not.toContain("sql");
    expect(plan.textContent?.toLowerCase()).not.toContain("select");
    expect(screen.getByRole("list", { name: "Stages" }).querySelector("[aria-current='step']")?.textContent).toBe("Answer");
  });

  it("shows a refusal and its suggestions", () => {
    const refused = [
      parse({ type: "stage", stage: "query_plan" }),
      parse({
        type: "refusal",
        code: "unsupported_dimension",
        message: "Ask cannot break out by campaign.",
        suggestions: ["Ask for an account total instead."],
      }),
      parse({ type: "done", runId: "00000000-0000-4000-8000-000000000099" }),
    ].reduce(reduceAskEvent, initialAskRun());
    render(<AskAnswerPanel state={refused} />);
    const refusal = screen.getByRole("region", { name: "Refusal" });
    expect(within(refusal).getByText("Ask cannot break out by campaign.")).toBeTruthy();
    expect(within(refusal).getByText("Ask for an account total instead.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Observed" })).toBeNull();
  });
});
