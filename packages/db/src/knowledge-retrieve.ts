import { and, cosineDistance, eq, inArray } from "drizzle-orm";
import type { KnowledgeCitation, KnowledgeRetrieveStore } from "@marketing-os/knowledge";
import type { Database } from "./context";
import { auditEvents, knowledgeChunks, knowledgeSources } from "./schema";

/** Drizzle-backed retrieve store. Call inside `withContext` so RLS applies. */
export function createKnowledgeRetrieveStore(tx: Database): KnowledgeRetrieveStore {
  return {
    async ownedSourceIds({ tenantId, workspaceId, sourceIds }) {
      if (sourceIds.length === 0) return [];
      const rows = await tx
        .select({ id: knowledgeSources.id })
        .from(knowledgeSources)
        .where(
          and(
            eq(knowledgeSources.tenantId, tenantId),
            eq(knowledgeSources.workspaceId, workspaceId),
            inArray(knowledgeSources.id, sourceIds),
          ),
        );
      return rows.map((row) => row.id);
    },

    async search({ tenantId, workspaceId, sourceIds, embedding, limit }) {
      if (sourceIds.length === 0) return [];
      const distance = cosineDistance(knowledgeChunks.embedding, embedding);
      const rows = await tx
        .select({
          sourceId: knowledgeChunks.sourceId,
          documentId: knowledgeChunks.documentId,
          chunkIndex: knowledgeChunks.chunkIndex,
          content: knowledgeChunks.content,
          distance,
        })
        .from(knowledgeChunks)
        .where(
          and(
            eq(knowledgeChunks.tenantId, tenantId),
            eq(knowledgeChunks.workspaceId, workspaceId),
            inArray(knowledgeChunks.sourceId, sourceIds),
          ),
        )
        .orderBy(distance)
        .limit(limit);

      return rows.map(
        (row): KnowledgeCitation => ({
          sourceId: row.sourceId,
          documentId: row.documentId,
          chunkIndex: row.chunkIndex,
          content: row.content,
          score: 1 - Number(row.distance ?? 1),
        }),
      );
    },
  };
}

export async function insertKnowledgeAudit(
  tx: Database,
  input: {
    tenantId: string;
    workspaceId: string;
    sourceId: string;
    query: string;
  },
): Promise<void> {
  await tx.insert(auditEvents).values({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    eventType: "knowledge.foreign_source_denied",
    resourceType: "knowledge_source",
    resourceId: input.sourceId,
    payload: { sourceId: input.sourceId, query: input.query },
  });
}
