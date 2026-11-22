import { describe, expect, it } from "vitest";
import { loadCases, runLive, runReplay, type AskCase } from "./run";

function wrongFixture(source: AskCase): AskCase {
  return {
    ...source,
    expect: {
      ...source.expect,
      observations: ["Spend: 1"],
      evidenceValue: 1,
    },
  };
}

describe("ask eval harness", () => {
  it("fails a fixture whose expected answer does not match the tool value", async () => {
    const spend = loadCases().find((item) => item.id === "spend-last-30-days");
    if (!spend) throw new Error("missing spend case");
    const card = await runReplay([wrongFixture(spend)]);
    expect(card.cases[0]?.pass).toBe(false);
    expect(card.failed).toBe(1);
    expect(card.cases[0]?.failures.join("\n")).toContain("Spend: 2550");
    expect(card.cases[0]?.failures.join("\n")).toContain("evidence value 2550");
  });

  it("replays the same scorecard twice and records the model and prompt versions", async () => {
    const first = await runReplay(loadCases());
    const second = await runReplay(loadCases());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.mode).toBe("replay");
    expect(first.model).toBe("gpt-test");
    expect(first.failed).toBe(0);
    expect(first.passed).toBe(31);
    expect(loadCases()).toHaveLength(31);
    const counts = Object.fromEntries(
      ["single_metric", "period_compare", "ratio", "freshness", "follow_up", "unsupported_dimension", "out_of_scope", "clarification", "injection", "partial_coverage"].map(
        (group) => [group, loadCases().filter((item) => item.group === group).length],
      ),
    );
    expect(counts).toEqual({
      single_metric: 5,
      period_compare: 4,
      ratio: 4,
      freshness: 3,
      follow_up: 3,
      unsupported_dimension: 3,
      out_of_scope: 2,
      clarification: 2,
      injection: 3,
      partial_coverage: 2,
    });
    expect(first.prompts).toEqual([
      { name: "ask.answer", version: "1" },
      { name: "ask.plan", version: "1" },
    ]);
    expect(first.cases.find((item) => item.id === "spend-last-30-days")).toMatchObject({
      id: "spend-last-30-days",
      model: "gpt-test",
      pass: true,
      failures: [],
    });
  });

  it("refuses a live run without a model key", async () => {
    await expect(runLive(loadCases(), {})).rejects.toThrow("MOS_EVAL_MODEL_KEY");
  });
});
