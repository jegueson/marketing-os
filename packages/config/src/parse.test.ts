import { describe, expect, it } from "vitest";
import { ValidationError } from "@marketing-os/core";
import skillSource from "../../../skills/starter/weekly-performance-review/skill.yaml";
import workflowSource from "../../../customer-configs/examples/weekly-performance-review/workflow.yaml";
import { diffConfigDocuments } from "./diff";
import { parseConfigYaml, serializeConfigYaml } from "./parse";

describe("config YAML parse and serialize", () => {
  it("parses the weekly review skill and workflow examples", () => {
    const skill = parseConfigYaml("skill", skillSource);
    const workflow = parseConfigYaml("workflow", workflowSource);
    expect(skill.kind).toBe("skill");
    expect(workflow.kind).toBe("workflow");
    if (skill.kind !== "skill" || workflow.kind !== "workflow") return;
    expect(skill.document.name).toBe("weekly-performance-review");
    expect(workflow.document.name).toBe("weekly-performance-review");
    expect(workflow.document.steps.map((step) => step.kind)).toEqual([
      "load_context",
      "read_metrics",
      "run_skill",
      "render_report",
    ]);
  });

  it("rejects a tool entry with an action field", () => {
    const bad = `
name: weekly-performance-review
version: 1.0.0
description: Compare the primary KPIs with the previous period.
domain: performance
inputs: []
contextRequirements:
  - metrics
tools:
  - connector: mock
    tool: list_campaigns
    action: write_budget
instructions: Use only the metric values in the input.
outputs:
  - name: summary
    type: string
    description: What changed
    required: true
evaluationSuite: weekly-performance-review
riskClass: low
`;
    expect(() => parseConfigYaml("skill", bad)).toThrow(ValidationError);
  });

  it("rejects invalid YAML without producing a document", () => {
    expect(() => parseConfigYaml("skill", "name: [\n")).toThrow(ValidationError);
  });

  it("round-trips a skill document through serialize and parse", () => {
    const parsed = parseConfigYaml("skill", skillSource);
    expect(parsed.kind).toBe("skill");
    if (parsed.kind !== "skill") return;
    const yaml = serializeConfigYaml(parsed.document);
    const again = parseConfigYaml("skill", yaml);
    expect(again.kind).toBe("skill");
    if (again.kind !== "skill") return;
    expect(again.document).toEqual(parsed.document);
    expect(diffConfigDocuments(parsed.document, again.document)).toEqual([]);
  });

  it("diffs against a previous active version", () => {
    const parsed = parseConfigYaml("skill", skillSource);
    expect(parsed.kind).toBe("skill");
    if (parsed.kind !== "skill") return;
    const next = { ...parsed.document, description: "Updated description for the weekly review." };
    const changes = diffConfigDocuments(parsed.document, next);
    expect(changes).toEqual([
      {
        path: "description",
        before: parsed.document.description,
        after: next.description,
      },
    ]);
  });
});
