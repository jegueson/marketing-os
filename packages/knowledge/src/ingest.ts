import type { ModelGateway } from "@marketing-os/model-gateway";
import { knowledgeSourceSchema, type KnowledgeSource } from "@marketing-os/schemas";
import { chunkText } from "./chunk";
import {
  assertTenantObjectKey,
  buildTenantObjectKey,
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  KnowledgeIngestError,
} from "./object-key";

export type KnowledgeChunkWrite = {
  chunkIndex: number;
  content: string;
  embedding: number[];
};

export type KnowledgeDocumentWrite = {
  tenantId: string;
  workspaceId: string;
  sourceId: string;
  title: string;
  objectKey: string;
  chunks: KnowledgeChunkWrite[];
};

export type KnowledgeIngestWriter = {
  write(document: KnowledgeDocumentWrite): Promise<{ documentId: string }>;
};

export type IngestKnowledgeInput = {
  tenantId: string;
  workspaceId: string;
  sourceId: string;
  source: KnowledgeSource;
  title: string;
  body: string;
  model: string;
  /** Optional pre-built key; must still sit under the tenant prefix. */
  objectKey?: string;
};

export type IngestKnowledgeResult = {
  documentId: string;
  objectKey: string;
  chunkCount: number;
};

/**
 * Chunk text, embed through the model gateway, and persist chunks.
 * A non-1536 embedding fails the ingest and never calls the writer.
 * Notion page bodies and R2 note bodies share this path.
 */
export async function ingestKnowledgeText(
  input: IngestKnowledgeInput,
  deps: { gateway: ModelGateway; writer: KnowledgeIngestWriter },
): Promise<IngestKnowledgeResult> {
  const source = knowledgeSourceSchema.parse(input.source);
  let objectKey: string;
  if (input.objectKey !== undefined) {
    assertTenantObjectKey(input.tenantId, input.objectKey);
    objectKey = input.objectKey;
  } else {
    objectKey = buildTenantObjectKey(input.tenantId, source.locator);
  }

  const pieces = chunkText(input.body);
  if (pieces.length === 0) {
    throw new KnowledgeIngestError("empty_body", "document body has no text to ingest");
  }

  const embedded = await deps.gateway.embed({
    model: input.model,
    input: pieces,
  });

  if (embedded.embeddings.length !== pieces.length) {
    throw new KnowledgeIngestError(
      "embedding_count_mismatch",
      "embedding count does not match chunk count",
    );
  }

  for (const [index, vector] of embedded.embeddings.entries()) {
    if (vector.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS) {
      throw new KnowledgeIngestError(
        "embedding_width",
        `embedding width must be ${KNOWLEDGE_EMBEDDING_DIMENSIONS}, got ${vector.length} at chunk ${index}`,
      );
    }
  }

  const chunks: KnowledgeChunkWrite[] = pieces.map((content, chunkIndex) => ({
    chunkIndex,
    content,
    embedding: embedded.embeddings[chunkIndex]!,
  }));

  const { documentId } = await deps.writer.write({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    sourceId: input.sourceId,
    title: input.title,
    objectKey,
    chunks,
  });

  return { documentId, objectKey, chunkCount: chunks.length };
}

/**
 * Notion connector returns page body text; ingest shares the R2 path.
 * Call after the connector has already fetched the page.
 */
export async function ingestNotionPage(
  input: Omit<IngestKnowledgeInput, "source"> & {
    source: Omit<KnowledgeSource, "kind"> & { kind: "notion" };
  },
  deps: { gateway: ModelGateway; writer: KnowledgeIngestWriter },
): Promise<IngestKnowledgeResult> {
  return ingestKnowledgeText(
    {
      ...input,
      source: { ...input.source, kind: "notion" },
    },
    deps,
  );
}
