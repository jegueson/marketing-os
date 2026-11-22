import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { profiles, tenants, workspaces } from "./tenancy";

/** One Ask thread. Visible only to the owning user. */
export const askConversations = pgTable(
  "ask_conversations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ask_conversations_owner").on(table.tenantId, table.userId, table.updatedAt),
    check("ask_conversations_title_check", sql`length(trim(${table.title})) > 0`),
  ],
);

/** A turn in a thread. user_id is the thread owner, including assistant rows. */
export const askMessages = pgTable(
  "ask_messages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => askConversations.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: text("role").notNull().$type<"user" | "assistant">(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ask_messages_conversation").on(table.conversationId, table.createdAt),
    check("ask_messages_role_check", sql`${table.role} in ('user','assistant')`),
  ],
);

/** One pipeline run. Stores a question hash, not the question text. */
export const askRuns = pgTable(
  "ask_runs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => askConversations.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => askMessages.id, { onDelete: "set null" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    status: text("status").notNull().$type<"running" | "succeeded" | "failed" | "aborted">(),
    promptName: text("prompt_name"),
    promptVersion: text("prompt_version"),
    questionHash: text("question_hash").notNull(),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_ask_runs_conversation").on(table.conversationId, table.createdAt),
    check("ask_runs_status_check", sql`${table.status} in ('running','succeeded','failed','aborted')`),
    check("ask_runs_question_hash_check", sql`length(trim(${table.questionHash})) > 0`),
  ],
);
