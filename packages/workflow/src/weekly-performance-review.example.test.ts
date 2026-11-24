import { describe, expect, it } from "vitest";
import { createInMemoryWorkflowPort } from "./memory";
import { interpretWorkflow } from "./interpreter";
import {
  WEEKLY_REVIEW_HALLUCINATED,
  buildWeeklyReviewDeps,
  loadWeeklyReviewFixtures,
} from "./fixtures/weekly-performance-review";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const workflowId = "33333333-3333-4333-8333-333333333333";

describe("weekly performance review example", () => {
  it("runs the committed example on the in-memory port with fixture spend only", async () => {
    const fixtures = loadWeeklyReviewFixtures();
    const deps = buildWeeklyReviewDeps(fixtures);

    const port = createInMemoryWorkflowPort();
    const started = await port.start({
      tenantId,
      workspaceId,
      workflowId,
      workflowVersion: 1,
      trigger: "manual",
    });
    const outcome = await interpretWorkflow(fixtures.workflow, {
      tenantId,
      workspaceId,
      deps,
    });
    expect(outcome.status).toBe("succeeded");
    expect(outcome.report?.body).toContain("mock.spend");
    expect(outcome.report?.body).toContain(String(fixtures.spend.current));
    expect(outcome.report?.body).not.toContain(String(WEEKLY_REVIEW_HALLUCINATED));
    expect(outcome.report?.body).not.toContain(String(fixtures.spend.previous + 1));

    expect(await port.complete({ tenantId, runId: started.runId, outcome })).toBe(true);
    const run = await port.get({ tenantId, runId: started.runId });
    expect(run?.report?.body).toContain(String(fixtures.spend.current));
    expect(run?.report?.body).not.toContain(String(WEEKLY_REVIEW_HALLUCINATED));
  });
});
