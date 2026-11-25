import type { KnowledgeDocumentWrite } from "@marketing-os/knowledge";
import { knowledgeChunks, knowledgeDocuments } from "./schema";
import type { Database } from "./context";

/** Persist one ingested document and its chunks in the caller's transaction. */
export async function writeKnowledgeDocument(
  tx: Database,
  document: KnowledgeDocumentWrite,
): Promise<{ documentId: string }> {
  const [row] = await tx
    .insert(knowledgeDocuments)
    .values({
      tenantId: document.tenantId,
      workspaceId: document.workspaceId,
      sourceId: document.sourceId,
      title: document.title,
      objectKey: document.objectKey,
    })
    .returning({ id: knowledgeDocuments.id });

  if (!row) {
    throw new Error("knowledge document insert returned no row");
  }

  if (document.chunks.length > 0) {
    await tx.insert(knowledgeChunks).values(
      document.chunks.map((chunk) => ({
        tenantId: document.tenantId,
        workspaceId: document.workspaceId,
        sourceId: document.sourceId,
        documentId: row.id,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        embedding: chunk.embedding,
      })),
    );
  }

  return { documentId: row.id };
}
