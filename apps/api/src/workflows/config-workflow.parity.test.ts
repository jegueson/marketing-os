import { build } from "esbuild";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  WEEKLY_REVIEW_HALLUCINATED,
  buildWeeklyReviewDeps,
  createInMemoryWorkflowPort,
  interpretWorkflow,
  loadWeeklyReviewFixtures,
  type WorkflowOutcome,
} from "@marketing-os/workflow";
import type { ConfigWorkflowParams } from "./params";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const workflowId = "33333333-3333-4333-8333-333333333333";

const here = dirname(fileURLToPath(import.meta.url));
const entryPath = join(here, "miniflare-entry.ts");

function stepStatuses(outcome: WorkflowOutcome): Array<{ stepId: string; status: string }> {
  return outcome.steps.map((step) => ({ stepId: step.stepId, status: step.status }));
}

describe("ConfigWorkflow Miniflare parity", () => {
  let mf: Miniflare | undefined;

  beforeAll(async () => {
    const bundled = await build({
      entryPoints: [entryPath],
      bundle: true,
      write: false,
      format: "esm",
      platform: "neutral",
      target: "es2022",
      conditions: ["worker", "browser", "import"],
      mainFields: ["module", "main"],
      external: ["cloudflare:workers", "cloudflare:test", "node:*"],
      logLevel: "silent",
    });
    const script = bundled.outputFiles[0]?.text;
    if (!script) {
      throw new Error("esbuild produced no output for miniflare-entry");
    }

    // Miniflare 5 takes a workers[] config; convertV4 keeps the familiar modules API.
    mf = new Miniflare(
      convertV4MiniflareOptions({
        name: "marketing-os-api",
        compatibilityDate: "2026-10-28",
        compatibilityFlags: ["nodejs_compat"],
        modules: [
          {
            type: "ESModule",
            path: "index.js",
            contents: script,
          },
        ],
        workflows: {
          CONFIG_WORKFLOW: {
            name: "config-workflow",
            className: "ConfigWorkflow",
          },
        },
      }),
    );
  }, 60_000);

  afterAll(async () => {
    await mf?.dispose();
  });

  it("returns the same step statuses as the in-memory weekly review run", async () => {
    const fixtures = loadWeeklyReviewFixtures();
    const deps = buildWeeklyReviewDeps(fixtures);

    const memoryPort = createInMemoryWorkflowPort();
    const started = await memoryPort.start({
      tenantId,
      workspaceId,
      workflowId,
      workflowVersion: 1,
      trigger: "manual",
    });
    const memoryOutcome = await interpretWorkflow(fixtures.workflow, {
      tenantId,
      workspaceId,
      deps,
    });
    expect(memoryOutcome.status).toBe("succeeded");
    await memoryPort.complete({ tenantId, runId: started.runId, outcome: memoryOutcome });

    const modelReply = JSON.stringify({
      summary: "Spend moved with the observed value.",
      metricKey: "mock.spend",
      value: WEEKLY_REVIEW_HALLUCINATED,
    });
    const params: ConfigWorkflowParams = {
      tenantId,
      workspaceId,
      workflowId,
      workflowVersion: 1,
      definition: fixtures.workflow,
      fixture: {
        skill: fixtures.skill,
        business: fixtures.business,
        spend: fixtures.spend,
        modelId: "gpt-test",
        modelReply,
      },
    };

    const runId = crypto.randomUUID();
    const response = await mf!.dispatchFetch("http://localhost/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: runId, params }),
    });
    expect(response.ok).toBe(true);
    const status = (await response.json()) as {
      status: string;
      output?: WorkflowOutcome;
      error?: { message: string };
    };
    expect(status.status).toBe("complete");
    expect(status.output).toBeDefined();
    const miniflareOutcome = status.output!;
    expect(miniflareOutcome.status).toBe("succeeded");
    expect(stepStatuses(miniflareOutcome)).toEqual(stepStatuses(memoryOutcome));
    expect(miniflareOutcome.report?.body).toContain(String(fixtures.spend.current));
    expect(miniflareOutcome.report?.body).not.toContain(String(WEEKLY_REVIEW_HALLUCINATED));
  }, 60_000);
});
