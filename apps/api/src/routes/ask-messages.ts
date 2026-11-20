import { z } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";
import { and, eq } from "drizzle-orm";
import { AppError, ForbiddenError, NotFoundError, ok } from "@marketing-os/core";
import {
  askConversations,
  askMessages,
  askRuns,
  featureFlags,
  loadBudgetSnapshot,
  recordUsage,
  resolveModelCredential,
  withContext,
  type Database,
  type DbContext,
} from "@marketing-os/db";
import { withLedger, type ModelGateway, type UsageLedgerEntry, type UsageSink } from "@marketing-os/model-gateway";
import { runAsk, type MetricReader } from "@marketing-os/ask";
import type { AskStreamEvent } from "@marketing-os/schemas";
import { requirePrincipal } from "../auth/principal";
import { requireWorkspace } from "../auth/access";
import { run, tenantContext, type AppContext } from "../context";
import { keyRingFromConfig } from "../lib/credentials";
import { recordAudit } from "../lib/events";
import { createDrizzleMetricReader } from "../ask/drizzle-metric-reader";
import { apiSuccessSchema, createRouter, defineRoute, errorResponses, jsonContent, uuidPathParam } from "../lib/openapi";

export const askMessageRoutes = createRouter();

const bodySchema = z
  .object({
    content: z.string().trim().min(1).max(2_000),
  })
  .strict();

const responseSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  runId: z.string().uuid(),
  observations: z.array(z.string()),
  interpretation: z.string(),
  freshness: z.enum(["live", "stale", "empty", "error"]),
  observed: z.array(
    z.object({
      ref: z.string(),
      value: z.number().nullable(),
      definitionVersion: z.string(),
    }),
  ),
});

const paramsSchema = z.object({
  workspaceId: uuidPathParam("workspaceId"),
  conversationId: uuidPathParam("conversationId"),
});

const messagePath = "/api/v1/workspaces/{workspaceId}/ask/conversations/{conversationId}/messages";
const streamPath = `${messagePath}/stream`;

const postRoute = defineRoute({
  method: "post",
  path: messagePath,
  tags: ["Ask"],
  security: [{ Bearer: [] }],
  middleware: [requirePrincipal, requireWorkspace("ask:use")],
  request: {
    params: paramsSchema,
    body: jsonContent(bodySchema, "Ask question"),
  },
  responses: {
    201: jsonContent(apiSuccessSchema(responseSchema, "AskMessageResponse"), "Evidenced answer"),
    ...errorResponses(401, 403, 404, 402, 422, 429),
  },
});

const streamRoute = defineRoute({
  method: "post",
  path: streamPath,
  tags: ["Ask"],
  security: [{ Bearer: [] }],
  middleware: [requirePrincipal, requireWorkspace("ask:use")],
  request: {
    params: paramsSchema,
    body: jsonContent(bodySchema, "Ask question"),
  },
  responses: {
    200: {
      description: "Ask event stream",
      content: {
        "text/event-stream": {
          schema: z.string().openapi({ description: "SSE data lines. Each payload is one AskStreamEvent." }),
        },
      },
    },
    ...errorResponses(401, 403, 404, 402, 422, 429),
  },
});

const NAMESPACED = /^[a-z0-9]+(?:[._][a-z0-9]+)+$/;

type PreparedAsk = {
  conversationId: string;
  content: string;
  workspaceId: string;
  tenantId: string;
  userId: string;
  role: string;
  requestId: string;
  db: Database;
  ctx: DbContext;
  catalog: string[];
  runId: string;
  hash: string;
  model: string;
  gateway: ModelGateway;
  reader: MetricReader;
};

async function questionHash(content: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

async function requireAskEnabled(c: AppContext): Promise<void> {
  const [flag] = await run(c, tenantContext(c), (tx) =>
    tx.select({ isEnabled: featureFlags.isEnabled }).from(featureFlags).where(eq(featureFlags.key, "ask_marketing")),
  );
  if (!flag?.isEnabled) throw new ForbiddenError("Ask Marketing is not enabled");
}

/** Auth, flag, rate limit, key, ownership, and hard budget. Throws before any model call. */
async function prepareAsk(c: AppContext, input: { conversationId: string; content: string }): Promise<PreparedAsk> {
  await requireAskEnabled(c);
  const access = c.get("access");
  const principal = c.get("principal");
  const workspaceId = access.workspaceId;
  if (!workspaceId) throw new NotFoundError("Workspace not found");
  const deps = c.get("deps");
  if (!(await deps.askRateLimiter(c.env).allow(`ask:${principal.userId}`))) {
    throw new AppError("rate_limited", "Ask is temporarily rate limited", 429);
  }

  const config = c.get("config");
  const ring = await keyRingFromConfig(config);
  const credential = await run(c, tenantContext(c), (tx) =>
    resolveModelCredential(tx, { tenantId: access.tenantId, ring }),
  );
  const owned = await run(c, tenantContext(c), async (tx) => {
    const [conversation] = await tx
      .select({ id: askConversations.id })
      .from(askConversations)
      .where(and(eq(askConversations.id, input.conversationId), eq(askConversations.workspaceId, workspaceId)));
    return conversation ?? null;
  });
  if (!owned) throw new NotFoundError("Conversation not found");

  const db = c.get("db")();
  const ctx = tenantContext(c);
  const snapshot = await withContext(db, ctx, (tx) => loadBudgetSnapshot(tx, access.tenantId));
  const cap = snapshot.budget?.monthlyCapMicroUsd;
  if (snapshot.budget?.enforcement === "hard" && cap != null && snapshot.monthSpendMicroUsd >= cap) {
    throw new AppError("budget_exceeded", "Monthly model budget exceeded", 402);
  }

  const reader = createDrizzleMetricReader(db, { tenantId: access.tenantId, workspaceId });
  const catalog = (await reader.listMetrics()).map((metric) => metric.key).filter((key) => NAMESPACED.test(key));
  const runId = crypto.randomUUID();
  const sink: UsageSink = {
    async record(entry: UsageLedgerEntry) {
      await recordUsage(db, ctx, { ...entry, runId });
    },
  };
  return {
    conversationId: input.conversationId,
    content: input.content,
    workspaceId,
    tenantId: access.tenantId,
    userId: principal.userId,
    role: access.role,
    requestId: c.get("requestId"),
    db,
    ctx,
    catalog,
    runId,
    hash: await questionHash(input.content),
    model: credential.defaultModel ?? "gpt-test",
    gateway: withLedger(deps.createModelGateway(credential, config, c.env), sink, {
      tenantId: access.tenantId,
      workspaceId,
      userId: principal.userId,
      runId,
      purpose: "ask",
      promptName: "ask.plan",
      promptVersion: "1",
    }),
    reader,
  };
}

async function persistAsk(
  prepared: PreparedAsk,
  outcome: { status: "succeeded" | "failed" | "aborted"; assistant: string; errorCode: string | null },
): Promise<string | null> {
  const assistantId = outcome.assistant.trim() ? crypto.randomUUID() : null;
  await withContext(prepared.db, prepared.ctx, async (tx) => {
    await tx.insert(askMessages).values({
      conversationId: prepared.conversationId,
      tenantId: prepared.tenantId,
      userId: prepared.userId,
      role: "user",
      content: prepared.content,
    });
    if (assistantId) {
      await tx.insert(askMessages).values({
        id: assistantId,
        conversationId: prepared.conversationId,
        tenantId: prepared.tenantId,
        userId: prepared.userId,
        role: "assistant",
        content: outcome.assistant,
      });
    }
    await tx.insert(askRuns).values({
      id: prepared.runId,
      conversationId: prepared.conversationId,
      messageId: assistantId,
      tenantId: prepared.tenantId,
      userId: prepared.userId,
      status: outcome.status,
      promptName: "ask.answer",
      promptVersion: "1",
      questionHash: prepared.hash,
      errorCode: outcome.errorCode,
      finishedAt: new Date(),
    });
    await recordAudit(tx, {
      tenantId: prepared.tenantId,
      workspaceId: prepared.workspaceId,
      actorId: prepared.userId,
      actorRole: prepared.role,
      requestId: prepared.requestId,
      eventType: outcome.status === "succeeded" ? "ask.message_created" : `ask.message_${outcome.status}`,
      resourceType: "ask_run",
      resourceId: prepared.runId,
      payload: { questionHash: prepared.hash },
    });
    await tx
      .update(askConversations)
      .set({ updatedAt: new Date() })
      .where(eq(askConversations.id, prepared.conversationId));
  });
  return assistantId;
}

function askInput(prepared: PreparedAsk, signal?: AbortSignal) {
  return {
    question: prepared.content,
    catalog: prepared.catalog,
    model: prepared.model,
    gateway: prepared.gateway,
    reader: prepared.reader,
    workspaceId: prepared.workspaceId,
    runId: prepared.runId,
    labels: Object.fromEntries(prepared.catalog.map((key) => [key, key])),
    ...(signal ? { signal } : {}),
  };
}

askMessageRoutes.openapi(postRoute, async (c) => {
  const { conversationId } = c.req.valid("param");
  const { content } = c.req.valid("json");
  const prepared = await prepareAsk(c, { conversationId, content });
  const events: AskStreamEvent[] = [];
  for await (const event of runAsk(askInput(prepared))) {
    events.push(event);
  }
  const answer = events.find((event) => event.type === "answer");
  const refusal = events.find((event) => event.type === "refusal");
  const failure = events.find((event) => event.type === "error");
  if (failure && failure.type === "error") {
    throw new AppError(failure.code, failure.message, failure.code === "rate_limited" ? 429 : 422);
  }
  if (!answer || answer.type !== "answer") {
    const code = refusal && refusal.type === "refusal" ? refusal.code : "plan_invalid";
    const message = refusal && refusal.type === "refusal" ? refusal.message : "Ask did not produce an answer";
    throw new AppError(code, message, code === "budget_exceeded" ? 402 : 422);
  }

  const messageId = await persistAsk(prepared, {
    status: "succeeded",
    assistant: answer.answer.observations.join("\n"),
    errorCode: null,
  });
  if (!messageId) throw new AppError("plan_invalid", "Ask did not produce an answer", 422);

  return c.json(
    ok({
      conversationId,
      messageId,
      runId: prepared.runId,
      observations: answer.answer.observations,
      interpretation: answer.answer.interpretation,
      freshness: answer.answer.evidence.freshness,
      observed: answer.answer.evidence.observed.map((fact) => ({
        ref: fact.ref,
        value: fact.value,
        definitionVersion: fact.definitionVersion,
      })),
    }),
    201,
  );
});

askMessageRoutes.openapi(streamRoute, async (c) => {
  const { conversationId } = c.req.valid("param");
  const { content } = c.req.valid("json");
  const prepared = await prepareAsk(c, { conversationId, content });
  const controller = new AbortController();

  return streamSSE(c, async (stream) => {
    const stop = () => controller.abort();
    c.req.raw.signal.addEventListener("abort", stop, { once: true });
    stream.onAbort(stop);
    const deltas: string[] = [];
    let assistant = "";
    let status: "succeeded" | "failed" = "failed";
    let errorCode: string | null = "plan_invalid";
    try {
      for await (const event of runAsk(askInput(prepared, controller.signal))) {
        if (stream.aborted || controller.signal.aborted) break;
        if (event.type === "delta") deltas.push(event.text);
        if (event.type === "answer") {
          status = "succeeded";
          errorCode = null;
          assistant = event.answer.observations.join("\n");
        }
        if (event.type === "refusal") {
          status = "failed";
          errorCode = event.code;
          assistant = event.message;
        }
        if (event.type === "error") {
          status = "failed";
          errorCode = event.code;
          assistant = event.message;
        }
        await stream.writeSSE({ data: JSON.stringify(event) });
      }
    } catch (err) {
      if (!isAbort(err) && !controller.signal.aborted) throw err;
    }
    // Disconnect aborts the in-flight model call. withLedger already wrote status aborted.
    if (controller.signal.aborted || stream.aborted) {
      await persistAsk(prepared, { status: "aborted", assistant: deltas.join("\n"), errorCode: "aborted" });
      return;
    }
    await persistAsk(prepared, { status, assistant, errorCode });
  });
});
