import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { workflowDefinitionSchema } from "@marketing-os/schemas";
import { parse as parseYaml } from "yaml";
import { interpretWorkflow, type WorkflowDeps } from "../interpreter";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const workflow = workflowDefinitionSchema.parse(
  parseYaml(readFileSync(join(root, "customer-configs/examples/spend-threshold/workflow.yaml"), "utf8")),
);

const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const workspaceA = "11111111-1111-4111-8111-111111111111";

describe("spend threshold example", () => {
  it("writes one recommendation and does not call the connector", async () => {
    const recommendations: { problem: string }[] = [];
    const executeAction = vi.fn(async () => {
      throw new Error("connector called");
    });
    const deps: WorkflowDeps = {
      model: "gpt-test",
      gateway: { complete: async () => ({ content: "" }) } as unknown as WorkflowDeps["gateway"],
      listActions: async () => {
        throw new Error("listActions called");
      },
      executeAction,
      reader: {
        async metricValue(query) {
          return { metricKey: query.metricKey, status: "ok", value: 2550, unit: "EUR" };
        },
        async metricCompare(query) {
          return {
            metricKey: query.metricKey,
            status: "ok",
            current: 2550,
            previous: 2100,
            delta: 450,
            unit: "EUR",
          };
        },
      },
      async loadBusinessProfile() {
        return null;
      },
      async loadBrandProfile() {
        return null;
      },
      async loadPublishedSkill() {
        return null;
      },
      async retrieveKnowledge() {
        return { chunks: [], deniedSourceIds: [] };
      },
      async recordAudit() {},
      async writeRecommendation(draft) {
        recommendations.push({ problem: draft.problem });
      },
    };

    const outcome = await interpretWorkflow(workflow, { tenantId: tenantA, workspaceId: workspaceA, deps });
    expect(outcome.status).toBe("succeeded");
    expect(recommendations).toEqual([{ problem: "Spend rose without a lead change." }]);
    expect(executeAction).not.toHaveBeenCalled();
    expect(workflow.steps.every((step) => step.kind !== "action")).toBe(true);
  });
});
