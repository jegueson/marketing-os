import type { ModelGateway } from "@marketing-os/model-gateway";
import { KNOWLEDGE_EMBEDDING_DIMENSIONS, KnowledgeIngestError } from "./object-key";

export type KnowledgeCitation = {
  sourceId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  score: number;
};

export type KnowledgeRetrieveStore = {
  /** Source ids that exist for this tenant (RLS / tenant filter already applied). */
  ownedSourceIds(input: {
    tenantId: string;
    workspaceId: string;
    sourceIds: string[];
  }): Promise<string[]>;
  search(input: {
    tenantId: string;
    workspaceId: string;
    sourceIds: string[];
    embedding: number[];
    limit: number;
  }): Promise<KnowledgeCitation[]>;
};

export type RetrieveKnowledgeInput = {
  tenantId: string;
  workspaceId: string;
  sourceIds: string[];
  query: string;
  model: string;
  limit?: number;
};

export type RetrieveKnowledgeResult = {
  chunks: KnowledgeCitation[];
  /** Requested source ids that are not owned by the caller tenant. */
  deniedSourceIds: string[];
};

/**
 * Tenant-scoped retrieval. Foreign source ids yield no text and are listed for audit.
 */
export async function retrieveKnowledge(
  input: RetrieveKnowledgeInput,
  deps: { gateway: ModelGateway; store: KnowledgeRetrieveStore },
): Promise<RetrieveKnowledgeResult> {
  if (input.sourceIds.length === 0) {
    return { chunks: [], deniedSourceIds: [] };
  }

  const owned = await deps.store.ownedSourceIds({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    sourceIds: input.sourceIds,
  });
  const ownedSet = new Set(owned);
  const deniedSourceIds = input.sourceIds.filter((id) => !ownedSet.has(id));
  if (owned.length === 0) {
    return { chunks: [], deniedSourceIds };
  }

  const embedded = await deps.gateway.embed({
    model: input.model,
    input: input.query,
  });
  const vector = embedded.embeddings[0];
  if (!vector || vector.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS) {
    throw new KnowledgeIngestError(
      "embedding_width",
      `query embedding width must be ${KNOWLEDGE_EMBEDDING_DIMENSIONS}`,
    );
  }

  const chunks = await deps.store.search({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    sourceIds: owned,
    embedding: vector,
    limit: input.limit ?? 8,
  });

  return { chunks, deniedSourceIds };
}
