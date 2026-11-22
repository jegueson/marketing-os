import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { withContext, type DbContext } from "./context";
import { askConversations, askMessages, askRuns, tenantMemberships, tenants, workspaces } from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
const ids = {
  tenantA: crypto.randomUUID(),
  tenantB: crypto.randomUUID(),
  workspaceA: crypto.randomUUID(),
  userA: "",
  userSame: "",
  userB: "",
  staff: "",
};

const ctxA = (): DbContext => ({ tenantId: ids.tenantA, userId: ids.userA, staff: false });

beforeAll(async () => {
  t = await createTestDatabase();
  ids.userA = await t.createUser("ask-a@example.com");
  ids.userSame = await t.createUser("ask-same@example.com");
  ids.userB = await t.createUser("ask-b@example.com");
  ids.staff = await t.createUser("ask-staff@example.com");
  await withContext(t.db, { tenantId: ids.tenantA, userId: ids.userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: ids.tenantA, slug: "ask-a", name: "Ask A" });
    await tx.insert(workspaces).values({
      id: ids.workspaceA,
      tenantId: ids.tenantA,
      slug: "default",
      name: "Default",
    });
    await tx.insert(tenantMemberships).values([
      { tenantId: ids.tenantA, userId: ids.userA, role: "customer_admin" },
      { tenantId: ids.tenantA, userId: ids.userSame, role: "customer_user" },
      { tenantId: ids.tenantA, userId: ids.staff, role: "customer_user" },
    ]);
  });
  await withContext(t.db, { tenantId: ids.tenantB, userId: ids.userB, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: ids.tenantB, slug: "ask-b", name: "Ask B" });
    await tx.insert(tenantMemberships).values({
      tenantId: ids.tenantB,
      userId: ids.userB,
      role: "customer_admin",
    });
  });
}, 60_000);

afterAll(async () => {
  await t.close();
});

async function seedThread(): Promise<string> {
  return withContext(t.db, ctxA(), async (tx) => {
    const [conversation] = await tx
      .insert(askConversations)
      .values({
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        userId: ids.userA,
        title: "Spend question",
      })
      .returning({ id: askConversations.id });
    if (!conversation) throw new Error("conversation insert returned no row");
    const [message] = await tx
      .insert(askMessages)
      .values({
        conversationId: conversation.id,
        tenantId: ids.tenantA,
        userId: ids.userA,
        role: "user",
        content: "How much did we spend?",
      })
      .returning({ id: askMessages.id });
    if (!message) throw new Error("message insert returned no row");
    await tx.insert(askRuns).values({
      conversationId: conversation.id,
      messageId: message.id,
      tenantId: ids.tenantA,
      userId: ids.userA,
      status: "succeeded",
      promptName: "ask.plan",
      promptVersion: "1",
      questionHash: "abc123",
    });
    return conversation.id;
  });
}

describe("ask conversations", () => {
  it("hides a thread from another user in the same tenant", async () => {
    const id = await seedThread();
    const own = await withContext(t.db, ctxA(), (tx) =>
      tx.select({ id: askConversations.id }).from(askConversations).where(eq(askConversations.id, id)),
    );
    const peer = await withContext(
      t.db,
      { tenantId: ids.tenantA, userId: ids.userSame, staff: false },
      (tx) => tx.select({ id: askConversations.id }).from(askConversations),
    );
    expect(own).toHaveLength(1);
    expect(peer).toEqual([]);
  });

  it("hides a thread from another tenant", async () => {
    const other = await withContext(
      t.db,
      { tenantId: ids.tenantB, userId: ids.userB, staff: false },
      (tx) => tx.select({ content: askMessages.content }).from(askMessages),
    );
    expect(other).toEqual([]);
  });

  it("denies support staff by default", async () => {
    const rows = await withContext(
      t.db,
      { tenantId: ids.tenantA, userId: ids.staff, staff: true },
      (tx) => tx.select({ id: askRuns.id }).from(askRuns),
    );
    expect(rows).toEqual([]);
  });

  it("cascades delete from the conversation to messages and runs", async () => {
    const id = await seedThread();
    await withContext(t.db, ctxA(), (tx) => tx.delete(askConversations).where(eq(askConversations.id, id)));
    const messages = await t.pg.query<{ count: string }>(
      "select count(*)::text as count from ask_messages where conversation_id = $1",
      [id],
    );
    const runs = await t.pg.query<{ count: string }>(
      "select count(*)::text as count from ask_runs where conversation_id = $1",
      [id],
    );
    expect(messages.rows[0]?.count).toBe("0");
    expect(runs.rows[0]?.count).toBe("0");
  });
});
