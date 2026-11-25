import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeGateway } from "@marketing-os/model-gateway";
import {
  ingestKnowledgeText,
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
} from "@marketing-os/knowledge";
import { withContext } from "./context";
import { writeKnowledgeDocument } from "./knowledge";
import { knowledgeChunks, knowledgeSources, tenants, workspaces } from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
const tenantA = crypto.randomUUID();
const tenantB = crypto.randomUUID();
const workspaceA = crypto.randomUUID();
let userA = "";

function embedding(seed = 0.01): number[] {
  return Array.from({ length: KNOWLEDGE_EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? seed : 0));
}

beforeAll(async () => {
  t = await createTestDatabase();
  userA = await t.createUser("knowledge-a@example.com");
  await withContext(t.db, { tenantId: tenantA, userId: userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantA, slug: "know-a", name: "Know A" });
    await tx.insert(workspaces).values({
      id: workspaceA,
      tenantId: tenantA,
      slug: "default",
      name: "Default",
    });
  });
  await withContext(t.db, { tenantId: tenantB, userId: userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantB, slug: "know-b", name: "Know B" });
    await tx.insert(workspaces).values({
      tenantId: tenantB,
      slug: "default",
      name: "Default",
    });
  });
}, 60_000);

afterAll(async () => {
  await t.close();
});

describe("knowledge ingest persistence", () => {
  it("uploaded note becomes chunks for that tenant only", async () => {
    const sourceId = crypto.randomUUID();
    await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, async (tx) => {
      await tx.insert(knowledgeSources).values({
        id: sourceId,
        tenantId: tenantA,
        workspaceId: workspaceA,
        name: "brand-notes",
        kind: "r2_upload",
        locator: "notes/brand.md",
      });
    });

    const gateway = new FakeGateway({
      models: [
        {
          id: "text-embedding-3-small",
          displayName: "embed",
          provider: "openai_compatible",
          inputPriceMicroUsdPer1M: 20,
          outputPriceMicroUsdPer1M: 0,
        },
      ],
      embedScripts: [{ embeddings: [embedding(0.31)], inputTokens: 9 }],
    });

    const result = await withContext(
      t.db,
      { tenantId: tenantA, userId: userA, staff: false },
      async (tx) =>
        ingestKnowledgeText(
          {
            tenantId: tenantA,
            workspaceId: workspaceA,
            sourceId,
            source: { name: "brand-notes", kind: "r2_upload", locator: "notes/brand.md" },
            title: "Brand notes",
            body: "Tenant A note about Glacier Sage.",
            model: "text-embedding-3-small",
          },
          {
            gateway,
            writer: {
              write: (document) => writeKnowledgeDocument(tx, document),
            },
          },
        ),
    );

    expect(result.chunkCount).toBe(1);

    const forA = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(knowledgeChunks),
    );
    expect(forA).toHaveLength(1);
    expect(forA[0]?.content).toContain("Glacier Sage");

    const forB = await withContext(t.db, { tenantId: tenantB, userId: userA, staff: false }, (tx) =>
      tx.select().from(knowledgeChunks),
    );
    expect(forB).toEqual([]);
  });
});
