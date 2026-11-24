import { describe, expect, it, vi } from "vitest";
import {
  WEEKLY_REVIEW_HALLUCINATED,
  loadWeeklyReviewFixtures,
} from "@marketing-os/workflow";
import { createCloudflareWorkflowPort } from "./cloudflare-port";
import type { ConfigWorkflowParams } from "./params";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherTenant = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const workflowId = "33333333-3333-4333-8333-333333333333";

describe("createCloudflareWorkflowPort", () => {
  it("starts via the Workflow binding and hides foreign-tenant gets", async () => {
    const fixtures = loadWeeklyReviewFixtures();
    const status = vi.fn(async () => ({
      status: "complete" as const,
      output: {
        status: "succeeded" as const,
        errorCode: null,
        steps: [
          { stepId: "ctx", kind: "load_context", status: "ok" as const, output: {}, errorCode: null },
        ],
        report: { title: "Weekly", body: `spend ${fixtures.spend.current}` },
      },
    }));
    const create = vi.fn(async ({ id }: { id: string; params: ConfigWorkflowParams }) => ({
      id,
      status,
    }));
    const get = vi.fn(async (id: string) => ({ id, status }));
    const binding = { create, get } as unknown as Workflow<ConfigWorkflowParams>;

    const port = createCloudflareWorkflowPort(binding, {
      async resolveParams(input) {
        return {
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          workflowId: input.workflowId,
          workflowVersion: input.workflowVersion,
          definition: fixtures.workflow,
          fixture: {
            skill: fixtures.skill,
            business: fixtures.business,
            spend: fixtures.spend,
            modelId: "gpt-test",
            modelReply: JSON.stringify({
              summary: "x",
              metricKey: "mock.spend",
              value: WEEKLY_REVIEW_HALLUCINATED,
            }),
          },
        };
      },
    });

    const started = await port.start({
      tenantId,
      workspaceId,
      workflowId,
      workflowVersion: 1,
      trigger: "manual",
    });
    expect(create).toHaveBeenCalledOnce();
    expect(await port.get({ tenantId: otherTenant, runId: started.runId })).toBeNull();
    const run = await port.get({ tenantId, runId: started.runId });
    expect(run?.status).toBe("succeeded");
    expect(run?.report?.body).toContain(String(fixtures.spend.current));
    expect(
      await port.complete({
        tenantId,
        runId: started.runId,
        outcome: {
          status: "succeeded",
          errorCode: null,
          steps: [],
          report: null,
        },
      }),
    ).toBe(false);
  });
});
