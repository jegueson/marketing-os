import { z } from "@hono/zod-openapi";
import { and, desc, eq, sql } from "drizzle-orm";
import { ForbiddenError, NotFoundError, ok, ValidationError } from "@marketing-os/core";
import { askConversations, askMessages, featureFlags } from "@marketing-os/db";
import { requirePrincipal } from "../auth/principal";
import { requireWorkspace } from "../auth/access";
import { run, tenantContext } from "../context";
import { apiSuccessSchema, createRouter, defineRoute, errorResponses, jsonContent, uuidPathParam } from "../lib/openapi";

export const askConversationRoutes = createRouter();

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const conversationSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const messageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string(),
});

const createBody = z
  .object({
    title: z.string().trim().min(1).max(200),
  })
  .strict();

const base = "/api/v1/workspaces/{workspaceId}/ask/conversations";

const listRoute = defineRoute({
  method: "get",
  path: base,
  tags: ["Ask"],
  security: [{ Bearer: [] }],
  middleware: [requirePrincipal, requireWorkspace("ask:use")],
  request: { params: z.object({ workspaceId: uuidPathParam("workspaceId") }) },
  responses: {
    200: jsonContent(apiSuccessSchema(z.array(conversationSchema), "AskConversationListResponse"), "Ask conversations"),
    ...errorResponses(401, 403, 404, 422),
  },
});

const createRoute = defineRoute({
  method: "post",
  path: base,
  tags: ["Ask"],
  security: [{ Bearer: [] }],
  middleware: [requirePrincipal, requireWorkspace("ask:use")],
  request: {
    params: z.object({ workspaceId: uuidPathParam("workspaceId") }),
    body: jsonContent(createBody, "New conversation"),
  },
  responses: {
    201: jsonContent(apiSuccessSchema(conversationSchema, "AskConversationCreatedResponse"), "Created conversation"),
    ...errorResponses(401, 403, 404, 422),
  },
});

const getRoute = defineRoute({
  method: "get",
  path: `${base}/{conversationId}`,
  tags: ["Ask"],
  security: [{ Bearer: [] }],
  middleware: [requirePrincipal, requireWorkspace("ask:use")],
  request: {
    params: z.object({
      workspaceId: uuidPathParam("workspaceId"),
      conversationId: uuidPathParam("conversationId"),
    }),
  },
  responses: {
    200: jsonContent(
      apiSuccessSchema(conversationSchema.extend({ messages: z.array(messageSchema) }), "AskConversationResponse"),
      "Ask conversation",
    ),
    ...errorResponses(401, 403, 404, 422),
  },
});

const deleteRoute = defineRoute({
  method: "delete",
  path: `${base}/{conversationId}`,
  tags: ["Ask"],
  security: [{ Bearer: [] }],
  middleware: [requirePrincipal, requireWorkspace("ask:use")],
  request: {
    params: z.object({
      workspaceId: uuidPathParam("workspaceId"),
      conversationId: uuidPathParam("conversationId"),
    }),
  },
  responses: {
    200: jsonContent(
      apiSuccessSchema(z.object({ id: z.string().uuid(), deleted: z.literal(true) }), "AskConversationDeletedResponse"),
      "Deleted conversation",
    ),
    ...errorResponses(401, 403, 404),
  },
});

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function requireAskEnabled(c: Parameters<typeof run>[0]): Promise<void> {
  const [flag] = await run(c, tenantContext(c), (tx) =>
    tx.select({ isEnabled: featureFlags.isEnabled }).from(featureFlags).where(eq(featureFlags.key, "ask_marketing")),
  );
  if (!flag?.isEnabled) throw new ForbiddenError("Ask Marketing is not enabled");
}

askConversationRoutes.openapi(listRoute, async (c) => {
  await requireAskEnabled(c);
  const query = listQuery.safeParse(c.req.query());
  if (!query.success) throw new ValidationError("Invalid query", query.error.flatten());
  const { page, limit } = query.data;
  const access = c.get("access");
  const { items, total } = await run(c, tenantContext(c), async (tx) => {
    const where = and(eq(askConversations.tenantId, access.tenantId), eq(askConversations.workspaceId, access.workspaceId!));
    const [counted] = await tx.select({ total: sql<number>`count(*)::int` }).from(askConversations).where(where);
    const rows = await tx
      .select()
      .from(askConversations)
      .where(where)
      .orderBy(desc(askConversations.updatedAt))
      .limit(limit)
      .offset((page - 1) * limit);
    return { total: counted?.total ?? 0, items: rows };
  });
  return c.json(
    ok(
      items.map((row) => ({
        id: row.id,
        title: row.title,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
      { total, page, limit },
    ),
    200,
  );
});

askConversationRoutes.openapi(createRoute, async (c) => {
  await requireAskEnabled(c);
  const body = c.req.valid("json");
  const access = c.get("access");
  const principal = c.get("principal");
  const [row] = await run(c, tenantContext(c), (tx) =>
    tx
      .insert(askConversations)
      .values({
        tenantId: access.tenantId,
        workspaceId: access.workspaceId!,
        userId: principal.userId,
        title: body.title,
      })
      .returning(),
  );
  if (!row) throw new NotFoundError("Conversation not found");
  return c.json(ok({ id: row.id, title: row.title, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) }), 201);
});

askConversationRoutes.openapi(getRoute, async (c) => {
  await requireAskEnabled(c);
  const { conversationId } = c.req.valid("param");
  const access = c.get("access");
  const loaded = await run(c, tenantContext(c), async (tx) => {
    const [conversation] = await tx
      .select()
      .from(askConversations)
      .where(and(eq(askConversations.id, conversationId), eq(askConversations.workspaceId, access.workspaceId!)));
    if (!conversation) return null;
    const messages = await tx
      .select()
      .from(askMessages)
      .where(eq(askMessages.conversationId, conversation.id))
      .orderBy(askMessages.createdAt);
    return { conversation, messages };
  });
  if (!loaded) throw new NotFoundError("Conversation not found");
  return c.json(
    ok({
      id: loaded.conversation.id,
      title: loaded.conversation.title,
      createdAt: iso(loaded.conversation.createdAt),
      updatedAt: iso(loaded.conversation.updatedAt),
      messages: loaded.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: iso(message.createdAt),
      })),
    }),
    200,
  );
});

askConversationRoutes.openapi(deleteRoute, async (c) => {
  await requireAskEnabled(c);
  const { conversationId } = c.req.valid("param");
  const access = c.get("access");
  const deleted = await run(c, tenantContext(c), async (tx) => {
    const [row] = await tx
      .delete(askConversations)
      .where(and(eq(askConversations.id, conversationId), eq(askConversations.workspaceId, access.workspaceId!)))
      .returning({ id: askConversations.id });
    return row ?? null;
  });
  if (!deleted) throw new NotFoundError("Conversation not found");
  return c.json(ok({ id: deleted.id, deleted: true as const }), 200);
});
