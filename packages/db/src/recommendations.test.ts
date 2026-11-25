import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withContext } from "./context";
import { insertRecommendation } from "./recommendations";
import { recommendations, tenants, workspaces } from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
const tenantA = crypto.randomUUID();
const tenantB = crypto.randomUUID();
const workspaceA = crypto.randomUUID();
let userA = "";

const fixture = {
  problem: "Spend rose without a lead change.",
  evidence: "mock.spend is 2550. Previous period is 2100. Lead count is unchanged.",
  proposedAction: "Create a Linear issue for the weekly review.",
  expectedImpact: "The specialist gets one tracked task.",
  confidence: "medium" as const,
  effort: "low" as const,
};

beforeAll(async () => {
  t = await createTestDatabase();
  userA = await t.createUser("reco-a@example.com");
  await withContext(t.db, { tenantId: tenantA, userId: userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantA, slug: "reco-a", name: "Reco A" });
    await tx.insert(workspaces).values({
      id: workspaceA,
      tenantId: tenantA,
      slug: "default",
      name: "Default",
    });
  });
  await withContext(t.db, { tenantId: tenantB, userId: userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantB, slug: "reco-b", name: "Reco B" });
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

describe("recommendation records", () => {
  it("inserts the fixture problem with no approval and hides it from the other tenant", async () => {
    const stored = await withContext(
      t.db,
      { tenantId: tenantA, userId: userA, staff: false },
      (tx) =>
        insertRecommendation(tx, {
          tenantId: tenantA,
          workspaceId: workspaceA,
          ...fixture,
        }),
    );

    expect(stored.problem).toBe(fixture.problem);
    expect(stored.evidence).toBe(fixture.evidence);
    expect(stored.approvalStatus).toBeNull();

    const forA = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(recommendations),
    );
    expect(forA).toHaveLength(1);
    expect(forA[0]?.problem).toBe(fixture.problem);

    const forB = await withContext(t.db, { tenantId: tenantB, userId: userA, staff: false }, (tx) =>
      tx.select().from(recommendations),
    );
    expect(forB).toEqual([]);
  });

  it("has no prompt column", async () => {
    type Row = typeof recommendations.$inferSelect;
    type PromptKey = Extract<keyof Row, "prompt" | "promptBody" | "prompt_body">;
    const promptKeyAbsent: PromptKey extends never ? true : false = true;
    expect(promptKeyAbsent).toBe(true);

    const columns = await t.pg.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'recommendations'
         and column_name ilike '%prompt%'`,
    );
    expect(columns.rows).toEqual([]);
  });
});
