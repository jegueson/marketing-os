import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { tenants, workspaces } from "./tenancy";

export type KnowledgeSourceKind = "notion" | "r2_upload";

/**
 * Tenant knowledge locator rows (ADR-0026 §8). Locators are bare keys, never URLs.
 * Must stay aligned with supabase/migrations/*_0028_knowledge.sql.
 */
export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull().$type<KnowledgeSourceKind>(),
    locator: text("locator").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("knowledge_sources_tenant_workspace_name").on(
      table.tenantId,
      table.workspaceId,
      table.name,
    ),
    index("idx_knowledge_sources_tenant_workspace").on(table.tenantId, table.workspaceId),
    check("knowledge_sources_kind_check", sql`${table.kind} in ('notion', 'r2_upload')`),
  ],
);

/** One ingested document under a source. Object keys stay inside the tenant prefix. */
export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    objectKey: text("object_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_knowledge_documents_tenant_source").on(
      table.tenantId,
      table.sourceId,
      table.createdAt,
    ),
    unique("knowledge_documents_tenant_object_key").on(table.tenantId, table.objectKey),
  ],
);

/**
 * Append-only embedding rows. Width is fixed at 1536 (ADR-0026).
 * Rows are never updated or deleted.
 */
export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("knowledge_chunks_document_index").on(table.documentId, table.chunkIndex),
    index("idx_knowledge_chunks_tenant_source").on(table.tenantId, table.sourceId),
    check("knowledge_chunks_index_nonneg_check", sql`${table.chunkIndex} >= 0`),
  ],
);
