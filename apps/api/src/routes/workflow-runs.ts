import { z } from "@hono/zod-openapi";
import { AppError, NotFoundError, ok, ValidationError } from "@marketing-os/core";
import {
  completeWorkflowRun,
  createKnowledgeRetrieveStore,
  getWorkflowRun,
  loadBudgetSnapshot,
  loadPublishedBrandProfile,
  loadPublishedBusinessProfile,
  loadPublishedSkill,
  insertRecommendation,
  loadPublishedWorkflow,
  recordUsage,
  resolveModelCredential,
  startWorkflowRun,
  withContext,
  type Database,
  type StoredWorkflowRun,
} from "@marketing-os/db";
import { retrieveKnowledge } from "@marketing-os/knowledge";
import { withLedger, type UsageLedgerEntry, type UsageSink } from "@marketing-os/model-gateway";
import { interpretWorkflow, type WorkflowDeps, type WorkflowMetricReader } from "@marketing-os/workflow";
import type { MetricReader } from "@marketing-os/ask";
import { requirePrincipal } from "../auth/principal";
import { requireWorkspace } from "../auth/access";
import { requireConfigEnabled } from "../auth/config-flag";
import { run, tenantContext, type AppContext } from "../context";
import { keyRingFromConfig } from "../lib/credentials";
import { recordAudit as writeAuditEvent } from "../lib/events";
import { createDrizzleMetricReader } from "../ask/drizzle-metric-reader";
import {
  apiSuccessSchema,
  createRouter,
  defineRoute,
  errorResponses,
  jsonContent,
  jsonValueSchema,
  uuidPathParam,
} from "../lib/openapi";

export const workflowRunRoutes = createRouter();

const createParams = z.object({
  workspaceId: uuidPathParam("workspaceId"),
  workflowId: uuidPathParam("workflowId"),
});
const getParams = z.object({
  workspaceId: uuidPathParam("workspaceId"),
  runId: uuidPathParam("runId"),
});

const stepSchema = z
  .object({
    stepId: z.string(),
    kind: z.string(),
    status: z.enum(["ok", "error", "skipped"]),
    output: jsonValueSchema.nullable(),
    errorCode: z.string().nullable(),
  })
  .openapi("WorkflowRunStep");

const reportSchema = z
  .object({
    title: z.string(),
    body: z.string(),
  })
  .openapi("WorkflowRunReport");

const runViewSchema = z
  .object({
    id: z.string().uuid(),
    workflowId: z.string().uuid(),
    workflowVersion: z.number().int(),
    trigger: z.literal("manual"),
    status: z.enum(["queued", "running", "succeeded", "failed", "cancelled", "awaiting_approval"]),
    errorCode: z.string().nullable(),
    steps: z.array(stepSchema),
    report: reportSchema.nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("WorkflowRunView");

const createPath = "/api/v1/workspaces/{workspaceId}/workflows/{workflowId}/test-runs";
const getPath = "/api/v1/workspaces/{workspaceId}/test-runs/{runId}";

const readMiddleware = [requirePrincipal, requireConfigEnabled, requireWorkspace("config:read")];
const writeMiddleware = [requirePrincipal, requireConfigEnabled, requireWorkspace("config:write")];

const createRoute = defineRoute({
  method: "post",
  path: createPath,
  tags: ["WorkflowRuns"],
  security: [{ Bearer: [] }],
  middleware: writeMiddleware,
  request: { params: createParams },
  responses: {
    200: jsonContent(apiSuccessSchema(runViewSchema, "WorkflowRunCreatedResponse"), "Test run result"),
    ...errorResponses(401, 403, 404, 422),
  },
});

const getRoute = defineRoute({
  method: "get",
  path: getPath,
  tags: ["WorkflowRuns"],
  security: [{ Bearer: [] }],
  middleware: readMiddleware,
  request: { params: getParams },
  responses: {
    200: jsonContent(apiSuccessSchema(runViewSchema, "WorkflowRunResponse"), "Test run"),
    ...errorResponses(401, 403, 404, 422),
  },
});

function workspaceId(access: { workspaceId: string | null }): string {
  if (!access.workspaceId) throw new NotFoundError("Workspace not found");
  return access.workspaceId;
}

function toView(stored: StoredWorkflowRun) {
  return {
    id: stored.id,
    workflowId: stored.workflowId,
    workflowVersion: stored.workflowVersion,
    trigger: "manual" as const,
    status: stored.status,
    errorCode: stored.errorCode,
    steps: stored.steps.map((step) => ({
      stepId: step.stepId,
      kind: step.kind,
      status: step.status,
      output: step.output ?? null,
      errorCode: step.errorCode,
    })),
    report: stored.report,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  };
}

function adaptMetricReader(
  reader: MetricReader,
  scope: { tenantId: string; workspaceId: string },
): WorkflowMetricReader {
  return {
    async metricValue(query) {
      if (query.tenantId !== scope.tenantId || query.workspaceId !== scope.workspaceId) {
        return { metricKey: query.metricKey, status: "no_data", value: null, unit: null };
      }
      const observed = await reader.metricValue({ metricKey: query.metricKey, range: query.range });
      return {
        metricKey: observed.metricKey,
        status: observed.status,
        value: observed.value,
        unit: observed.unit,
      };
    },
    async metricCompare(query) {
      if (query.tenantId !== scope.tenantId || query.workspaceId !== scope.workspaceId) {
        return {
          metricKey: query.metricKey,
          status: "no_data",
          current: null,
          previous: null,
          delta: null,
          unit: null,
        };
      }
      const compared = await reader.metricCompare({ metricKey: query.metricKey, range: query.range });
      return {
        metricKey: compared.metricKey,
        status: compared.status,
        current: compared.current,
        previous: compared.previous,
        delta: compared.delta,
        unit: null,
      };
    },
  };
}

async function buildDeps(
  c: AppContext,
  input: { tenantId: string; workspaceId: string; runId: string },
): Promise<WorkflowDeps> {
  const config = c.get("config");
  const appDeps = c.get("deps");
  const db = c.get("db")();
  const ctx = tenantContext(c);
  const ring = await keyRingFromConfig(config);
  const credential = await withContext(db, ctx, (tx) =>
    resolveModelCredential(tx, { tenantId: input.tenantId, ring }),
  );
  const snapshot = await withContext(db, ctx, (tx) => loadBudgetSnapshot(tx, input.tenantId));
  const cap = snapshot.budget?.monthlyCapMicroUsd;
  if (snapshot.budget?.enforcement === "hard" && cap != null && snapshot.monthSpendMicroUsd >= cap) {
    throw new AppError("budget_exceeded", "Monthly model budget exceeded", 402);
  }
  const sink: UsageSink = {
    async record(entry: UsageLedgerEntry) {
      await recordUsage(db, ctx, { ...entry, runId: input.runId });
    },
  };
  const askReader = createDrizzleMetricReader(db, {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
  });
  const scope = { tenantId: input.tenantId, workspaceId: input.workspaceId };
  return {
    model: credential.defaultModel ?? "gpt-test",
    gateway: withLedger(appDeps.createModelGateway(credential, config, c.env), sink, {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      userId: c.get("principal").userId,
      runId: input.runId,
      purpose: "workflow",
      promptName: null,
      promptVersion: null,
    }),
    reader: adaptMetricReader(askReader, scope),
    async listActions() {
      throw new AppError("forbidden", "Connector actions are disabled for Sprint 4 workflows", 403);
    },
    async executeAction() {
      throw new AppError("forbidden", "Connector actions are disabled for Sprint 4 workflows", 403);
    },
    async writeRecommendation(draft) {
      await withContext(db, { tenantId: draft.tenantId, userId: null, staff: false }, (tx: Database) =>
        insertRecommendation(tx, {
          tenantId: draft.tenantId,
          workspaceId: draft.workspaceId,
          problem: draft.problem,
          evidence: draft.evidence,
          proposedAction: draft.proposedAction,
          expectedImpact: draft.expectedImpact,
          confidence: draft.confidence,
          effort: draft.effort,
        }),
      );
    },
    async loadBusinessProfile(tenantId, wsId) {
      return withContext(db, { tenantId, userId: null, staff: false }, (tx: Database) =>
        loadPublishedBusinessProfile(tx, { tenantId, workspaceId: wsId }),
      );
    },
    async loadBrandProfile(tenantId, wsId) {
      return withContext(db, { tenantId, userId: null, staff: false }, (tx: Database) =>
        loadPublishedBrandProfile(tx, { tenantId, workspaceId: wsId }),
      );
    },
    async loadPublishedSkill(tenantId, wsId, name, version) {
      return withContext(db, { tenantId, userId: null, staff: false }, (tx: Database) =>
        loadPublishedSkill(tx, { tenantId, workspaceId: wsId, name, version }),
      );
    },
    async retrieveKnowledge(knowledge) {
      return withContext(db, { tenantId: knowledge.tenantId, userId: null, staff: false }, async (tx) =>
        retrieveKnowledge(
          {
            tenantId: knowledge.tenantId,
            workspaceId: knowledge.workspaceId,
            sourceIds: knowledge.sourceIds,
            query: knowledge.query,
            model: credential.defaultModel ?? "text-embedding-3-small",
          },
          {
            gateway: withLedger(appDeps.createModelGateway(credential, config, c.env), sink, {
              tenantId: knowledge.tenantId,
              workspaceId: knowledge.workspaceId,
              userId: c.get("principal").userId,
              runId: input.runId,
              purpose: "knowledge",
              promptName: null,
              promptVersion: null,
            }),
            store: createKnowledgeRetrieveStore(tx),
          },
        ),
      );
    },
    async recordAudit(event) {
      await withContext(db, { tenantId: event.tenantId, userId: null, staff: false }, (tx) =>
        writeAuditEvent(tx, {
          eventType: event.eventType,
          tenantId: event.tenantId,
          workspaceId: event.workspaceId,
          ...(event.resourceType !== undefined ? { resourceType: event.resourceType } : {}),
          ...(event.resourceId !== undefined ? { resourceId: event.resourceId } : {}),
          payload: event.payload ?? {},
          actorId: c.get("principal").userId,
        }),
      );
    },
  };
}

workflowRunRoutes.openapi(createRoute, async (c) => {
  const { workflowId } = c.req.valid("param");
  const access = c.get("access");
  const principal = c.get("principal");
  const workspace = workspaceId(access);

  const published = await run(c, tenantContext(c), (tx) =>
    loadPublishedWorkflow(tx, {
      tenantId: access.tenantId,
      workspaceId: workspace,
      workflowId,
    }),
  );
  if (published.definition.trigger.type !== "manual") {
    throw new ValidationError("Only manual workflows can be test-run", {
      issues: [{ path: "trigger", code: "custom", message: "trigger_not_active" }],
    });
  }

  // Resolve model/budget before inserting a run so a 402/503 never leaves a stuck queued row.
  const runId = crypto.randomUUID();
  const deps = await buildDeps(c, {
    tenantId: access.tenantId,
    workspaceId: workspace,
    runId,
  });

  const started = await run(c, tenantContext(c), (tx) =>
    startWorkflowRun(tx, {
      tenantId: access.tenantId,
      workspaceId: workspace,
      workflowId: published.id,
      workflowVersion: published.version,
      trigger: "manual",
      createdBy: principal.userId,
      runId,
    }),
  );

  let outcome;
  try {
    outcome = await interpretWorkflow(published.definition, {
      tenantId: access.tenantId,
      workspaceId: workspace,
      deps,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "workflow test-run interpreter failed",
        tenantId: access.tenantId,
        workspaceId: workspace,
        runId: started.id,
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
    outcome = {
      status: "failed" as const,
      errorCode: "step_failed",
      steps: [],
      report: null,
    };
  }

  const completed = await run(c, tenantContext(c), async (tx) => {
    const updated = await completeWorkflowRun(tx, {
      tenantId: access.tenantId,
      workspaceId: workspace,
      runId: started.id,
      outcome: {
        status: outcome.status,
        errorCode: outcome.errorCode,
        steps: outcome.steps.map((step) => ({
          stepId: step.stepId,
          kind: step.kind,
          status: step.status,
          output: step.output,
          errorCode: step.errorCode,
        })),
        report: outcome.report,
      },
    });
    if (!updated) throw new NotFoundError("Workflow run not found");
    await writeAuditEvent(tx, {
      eventType: "config.workflow_test_run",
      tenantId: access.tenantId,
      workspaceId: workspace,
      actorId: principal.userId,
      actorRole: access.role,
      requestId: c.get("requestId"),
      resourceType: "workflow_run",
      resourceId: updated.id,
      payload: {
        workflowId: updated.workflowId,
        workflowVersion: updated.workflowVersion,
        status: updated.status,
      },
    });
    return updated;
  });

  return c.json(ok(toView(completed)), 200);
});

workflowRunRoutes.openapi(getRoute, async (c) => {
  const { runId } = c.req.valid("param");
  const access = c.get("access");
  const workspace = workspaceId(access);
  const row = await run(c, tenantContext(c), (tx) =>
    getWorkflowRun(tx, {
      tenantId: access.tenantId,
      workspaceId: workspace,
      runId,
    }),
  );
  if (!row) throw new NotFoundError("Workflow run not found");
  return c.json(ok(toView(row)), 200);
});
