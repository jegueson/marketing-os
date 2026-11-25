import { describe, expect, it } from "vitest";
import {
  FakeGateway,
  InMemoryUsageSink,
  withLedger,
} from "@marketing-os/model-gateway";
import {
  ingestKnowledgeText,
  ingestNotionPage,
  type KnowledgeDocumentWrite,
  type KnowledgeIngestWriter,
} from "./ingest";
import { KNOWLEDGE_EMBEDDING_DIMENSIONS, KnowledgeIngestError } from "./object-key";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const workspaceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sourceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const secretBody = "CONFIDENTIAL_BRAND_VOICE_SENTENCE_DO_NOT_LEAK";

function embedding(width: number, seed = 0.01): number[] {
  return Array.from({ length: width }, (_, i) => (i === 0 ? seed : 0));
}

function capturingWriter(): KnowledgeIngestWriter & { writes: KnowledgeDocumentWrite[] } {
  const writes: KnowledgeDocumentWrite[] = [];
  return {
    writes,
    async write(document) {
      writes.push({
        ...document,
        chunks: document.chunks.map((c) => ({ ...c, embedding: [...c.embedding] })),
      });
      return { documentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" };
    },
  };
}

function gatewayWith(embeddings: number[][]) {
  return new FakeGateway({
    models: [
      {
        id: "text-embedding-3-small",
        displayName: "embed",
        provider: "openai_compatible",
        inputPriceMicroUsdPer1M: 20,
        outputPriceMicroUsdPer1M: 0,
      },
    ],
    embedScripts: [{ embeddings, inputTokens: 12 }],
  });
}

describe("ingestKnowledgeText", () => {
  it("writes chunks for an uploaded note under the tenant prefix", async () => {
    const writer = capturingWriter();
    const gateway = gatewayWith([embedding(KNOWLEDGE_EMBEDDING_DIMENSIONS)]);
    const result = await ingestKnowledgeText(
      {
        tenantId,
        workspaceId,
        sourceId,
        source: { name: "brand-notes", kind: "r2_upload", locator: "notes/brand.md" },
        title: "Brand notes",
        body: secretBody,
        model: "text-embedding-3-small",
      },
      { gateway, writer },
    );

    expect(result.objectKey).toBe(`${tenantId}/notes/brand.md`);
    expect(result.chunkCount).toBe(1);
    expect(writer.writes).toHaveLength(1);
    expect(writer.writes[0]?.chunks[0]?.content).toBe(secretBody);
    expect(writer.writes[0]?.chunks[0]?.embedding).toHaveLength(KNOWLEDGE_EMBEDDING_DIMENSIONS);
  });

  it("wrong width writes no chunk", async () => {
    const writer = capturingWriter();
    const gateway = gatewayWith([embedding(768)]);
    await expect(
      ingestKnowledgeText(
        {
          tenantId,
          workspaceId,
          sourceId,
          source: { name: "brand-notes", kind: "r2_upload", locator: "notes/brand.md" },
          title: "Brand notes",
          body: secretBody,
          model: "text-embedding-3-small",
        },
        { gateway, writer },
      ),
    ).rejects.toMatchObject({ code: "embedding_width" } satisfies Partial<KnowledgeIngestError>);
    expect(writer.writes).toEqual([]);
  });

  it("ledger row has no document text", async () => {
    const writer = capturingWriter();
    const sink = new InMemoryUsageSink();
    const gateway = withLedger(gatewayWith([embedding(KNOWLEDGE_EMBEDDING_DIMENSIONS)]), sink, {
      tenantId,
      workspaceId,
      userId: null,
      runId: null,
      purpose: "knowledge",
      promptName: null,
      promptVersion: null,
    });

    await ingestKnowledgeText(
      {
        tenantId,
        workspaceId,
        sourceId,
        source: { name: "brand-notes", kind: "r2_upload", locator: "notes/brand.md" },
        title: "Brand notes",
        body: secretBody,
        model: "text-embedding-3-small",
      },
      { gateway, writer },
    );

    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0]?.purpose).toBe("knowledge");
    expect(JSON.stringify(sink.entries)).not.toContain(secretBody);
  });

  it("object key cannot leave the tenant prefix", async () => {
    const writer = capturingWriter();
    const gateway = gatewayWith([embedding(KNOWLEDGE_EMBEDDING_DIMENSIONS)]);
    await expect(
      ingestKnowledgeText(
        {
          tenantId,
          workspaceId,
          sourceId,
          source: { name: "brand-notes", kind: "r2_upload", locator: "notes/brand.md" },
          title: "Brand notes",
          body: secretBody,
          model: "text-embedding-3-small",
          objectKey: "other-tenant/notes/brand.md",
        },
        { gateway, writer },
      ),
    ).rejects.toMatchObject({ code: "object_key_escape" });
    expect(writer.writes).toEqual([]);
    expect(gateway.calls.embed).toEqual([]);
  });

  it("ingests a Notion page body through the same path", async () => {
    const writer = capturingWriter();
    const gateway = gatewayWith([embedding(KNOWLEDGE_EMBEDDING_DIMENSIONS, 0.4)]);
    const result = await ingestNotionPage(
      {
        tenantId,
        workspaceId,
        sourceId,
        source: { name: "notion-brief", kind: "notion", locator: "page-abc" },
        title: "Brief",
        body: "Notion page body for the brief.",
        model: "text-embedding-3-small",
      },
      { gateway, writer },
    );
    expect(result.objectKey).toBe(`${tenantId}/page-abc`);
    expect(writer.writes[0]?.chunks[0]?.content).toContain("Notion page body");
  });
});
