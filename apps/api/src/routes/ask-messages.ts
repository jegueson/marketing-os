import { z } from "@hono/zod-openapi";
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
} from "@marketing-os/db";
import { withLedger, type UsageLedgerEntry, type UsageSink } from "@marketing-os/model-gateway";
import { runAsk } from "@marketing-os/ask";
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

const path = "/api/v1/workspaces/{workspaceId}/ask/conversations/{conversationId}/messages";

const postRoute = defineRoute({
  method: "post",
  path,
  tags: ["Ask"],
  security: [{ Bearer: [] }],
  middleware: [requirePrincipal, requireWorkspace("ask:use")],
  request: {
    params: z.object({
      workspaceId: uuidPathParam("workspaceId"),
      conversationId: uuidPathParam("conversationId"),
    }),
    body: jsonContent(bodySchema, "Ask question"),
  },
  responses: {
    201: jsonContent(apiSuccessSchema(responseSchema, "AskMessageResponse"), "Evidenced answer"),
    ...errorResponses(401, 403, 404, 402, 422, 429),
  },
});

const NAMESPACED = /^[a-z0-9]+(?:[._][a-z0-9]+)+$/;

async function questionHash(content: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function requireAskEnabled(c: AppContext): Promise<void> {
  const [flag] = await run(c, tenantContext(c), (tx) =>
    tx.select({ isEnabled: featureFlags.isEnabled }).from(featureFlags).where(eq(featureFlags.key, "ask_marketing")),
  );
  if (!flag?.isEnabled) throw new ForbiddenError("Ask Marketing is not enabled");
}

askMessageRoutes.openapi(postRoute, async (c) => {
  await requireAskEnabled(c);
  const { conversationId } = c.req.valid("param");
  const { content } = c.req.valid("json");
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
      .where(and(eq(askConversations.id, conversationId), eq(askConversations.workspaceId, workspaceId)));
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
  const hash = await questionHash(content);
  const sink: UsageSink = {
    async record(entry: UsageLedgerEntry) {
      await recordUsage(db, ctx, { ...entry, runId });
    },
  };
  const gateway = withLedger(deps.createModelGateway(credential, config, c.env), sink, {
    tenantId: access.tenantId,
    workspaceId,
    userId: principal.userId,
    runId,
    purpose: "ask",
    promptName: "ask.plan",
    promptVersion: "1",
  });

  const events: AskStreamEvent[] = [];
  for await (const event of runAsk({
    question: content,
    catalog,
    model: credential.defaultModel ?? "gpt-test",
    gateway,
    reader,
    workspaceId,
    runId,
    labels: Object.fromEntries(catalog.map((key) => [key, key])),
  })) {
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

  const messageId = crypto.randomUUID();
  await withContext(db, ctx, async (tx) => {
    await tx.insert(askMessages).values({
      conversationId,
      tenantId: access.tenantId,
      userId: principal.userId,
      role: "user",
      content,
    });
    await tx.insert(askMessages).values({
      id: messageId,
      conversationId,
      tenantId: access.tenantId,
      userId: principal.userId,
      role: "assistant",
      content: answer.answer.observations.join("\n"),
    });
    await tx.insert(askRuns).values({
      id: runId,
      conversationId,
      messageId,
      tenantId: access.tenantId,
      userId: principal.userId,
      status: "succeeded",
      promptName: "ask.answer",
      promptVersion: "1",
      questionHash: hash,
    });
    await recordAudit(tx, {
      tenantId: access.tenantId,
      workspaceId,
      actorId: principal.userId,
      actorRole: access.role,
      requestId: c.get("requestId"),
      eventType: "ask.message_created",
      resourceType: "ask_run",
      resourceId: runId,
      payload: { questionHash: hash },
    });
    await tx
      .update(askConversations)
      .set({ updatedAt: new Date() })
      .where(eq(askConversations.id, conversationId));
  });

  return c.json(
    ok({
      conversationId,
      messageId,
      runId,
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
