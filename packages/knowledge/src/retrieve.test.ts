import { describe, expect, it } from "vitest";
import { FakeGateway } from "@marketing-os/model-gateway";
import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from "./object-key";
import {
  retrieveKnowledge,
  type KnowledgeCitation,
  type KnowledgeRetrieveStore,
} from "./retrieve";

const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const workspaceA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sourceA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const sourceB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const foreignSentence = "TENANT-B-ONLY-SENTENCE-ABOUT-SPEND";

function embedding(seed = 0.01): number[] {
  return Array.from({ length: KNOWLEDGE_EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? seed : 0));
}

function gateway() {
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
    embedScripts: [{ embeddings: [embedding(0.5)], inputTokens: 4 }],
  });
}

function store(opts: {
  owned: string[];
  chunks: KnowledgeCitation[];
}): KnowledgeRetrieveStore & { searches: number } {
  const state = { searches: 0 };
  return {
    get searches() {
      return state.searches;
    },
    async ownedSourceIds({ sourceIds }) {
      const owned = new Set(opts.owned);
      return sourceIds.filter((id) => owned.has(id));
    },
    async search() {
      state.searches += 1;
      return opts.chunks.map((c) => ({ ...c }));
    },
  };
}

describe("retrieveKnowledge", () => {
  it("foreign source id returns an empty list", async () => {
    const knowledgeStore = store({
      owned: [sourceA],
      chunks: [
        {
          sourceId: sourceA,
          documentId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          chunkIndex: 0,
          content: "Tenant A brand note",
          score: 0.9,
        },
      ],
    });
    const result = await retrieveKnowledge(
      {
        tenantId: tenantA,
        workspaceId: workspaceA,
        sourceIds: [sourceB],
        query: "spend",
        model: "text-embedding-3-small",
      },
      { gateway: gateway(), store: knowledgeStore },
    );
    expect(result.chunks).toEqual([]);
    expect(result.deniedSourceIds).toEqual([sourceB]);
    expect(knowledgeStore.searches).toBe(0);
  });

  it("never returns another tenant's sentence when mixing source ids", async () => {
    const knowledgeStore = store({
      owned: [sourceA],
      chunks: [
        {
          sourceId: sourceA,
          documentId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          chunkIndex: 0,
          content: "Tenant A brand note",
          score: 0.91,
        },
      ],
    });
    const result = await retrieveKnowledge(
      {
        tenantId: tenantA,
        workspaceId: workspaceA,
        sourceIds: [sourceA, sourceB],
        query: "brand",
        model: "text-embedding-3-small",
      },
      { gateway: gateway(), store: knowledgeStore },
    );
    expect(result.deniedSourceIds).toEqual([sourceB]);
    expect(result.chunks.map((c) => c.content).join("\n")).not.toContain(foreignSentence);
    expect(result.chunks[0]?.content).toContain("Tenant A brand note");
  });
});
