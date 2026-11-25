import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeGateway } from "@marketing-os/model-gateway";
import {
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  retrieveKnowledge,
} from "@marketing-os/knowledge";
import { eq } from "drizzle-orm";
import { withContext } from "./context";
import { writeKnowledgeDocument } from "./knowledge";
import { createKnowledgeRetrieveStore, insertKnowledgeAudit } from "./knowledge-retrieve";
import { auditEvents, knowledgeSources, tenants, workspaces } from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
const tenantA = crypto.randomUUID();
const tenantB = crypto.randomUUID();
const workspaceA = crypto.randomUUID();
const workspaceB = crypto.randomUUID();
const sourceA = crypto.randomUUID();
const sourceB = crypto.randomUUID();
let userA = "";
const foreignSentence = "TENANT-B-ONLY-SENTENCE-ABOUT-SPEND";

function embedding(seed = 0.01): number[] {
  return Array.from({ length: KNOWLEDGE_EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? seed : 0));
}

beforeAll(async () => {
  t = await createTestDatabase();
  userA = await t.createUser("retrieve-a@example.com");
  await withContext(t.db, { tenantId: tenantA, userId: userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantA, slug: "ret-a", name: "Ret A" });
    await tx.insert(workspaces).values({
      id: workspaceA,
      tenantId: tenantA,
      slug: "default",
      name: "Default",
    });
    await tx.insert(knowledgeSources).values({
      id: sourceA,
      tenantId: tenantA,
      workspaceId: workspaceA,
      name: "brand-notes",
      kind: "r2_upload",
      locator: "notes/brand.md",
    });
  });
  await withContext(t.db, { tenantId: tenantB, userId: userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantB, slug: "ret-b", name: "Ret B" });
    await tx.insert(workspaces).values({
      id: workspaceB,
      tenantId: tenantB,
      slug: "default",
      name: "Default",
    });
    await tx.insert(knowledgeSources).values({
      id: sourceB,
      tenantId: tenantB,
      workspaceId: workspaceB,
      name: "secret-notes",
      kind: "r2_upload",
      locator: "notes/secret.md",
    });
    await writeKnowledgeDocument(tx, {
      tenantId: tenantB,
      workspaceId: workspaceB,
      sourceId: sourceB,
      title: "Secret",
      objectKey: `${tenantB}/notes/secret.md`,
      chunks: [
        {
          chunkIndex: 0,
          content: foreignSentence,
          embedding: embedding(0.77),
        },
      ],
    });
  });
}, 60_000);

afterAll(async () => {
  await t.close();
});

describe("knowledge retrieve store", () => {
  it("foreign source id returns empty chunks and can be audited", async () => {
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
      embedScripts: [{ embeddings: [embedding(0.2)], inputTokens: 3 }],
    });

    const result = await withContext(
      t.db,
      { tenantId: tenantA, userId: userA, staff: false },
      async (tx) => {
        const retrieved = await retrieveKnowledge(
          {
            tenantId: tenantA,
            workspaceId: workspaceA,
            sourceIds: [sourceB],
            query: "spend",
            model: "text-embedding-3-small",
          },
          { gateway, store: createKnowledgeRetrieveStore(tx) },
        );
        for (const sourceId of retrieved.deniedSourceIds) {
          await insertKnowledgeAudit(tx, {
            tenantId: tenantA,
            workspaceId: workspaceA,
            sourceId,
            query: "spend",
          });
        }
        return retrieved;
      },
    );

    expect(result.chunks).toEqual([]);
    expect(result.deniedSourceIds).toEqual([sourceB]);
    expect(JSON.stringify(result)).not.toContain(foreignSentence);

    const audits = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(auditEvents).where(eq(auditEvents.eventType, "knowledge.foreign_source_denied")),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]?.resourceId).toBe(sourceB);
  });
});
