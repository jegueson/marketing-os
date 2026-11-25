import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withContext } from "./context";
import { tenants, workspaces } from "./schema";
import { insertWorkload, listWorkload } from "./workload";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
const tenantA = crypto.randomUUID();
const tenantB = crypto.randomUUID();
const workspaceA = crypto.randomUUID();
let userA = "";

const fixture = {
  category: "reporting" as const,
  baselineHours: 40,
  hoursAbsorbed: 12,
};

beforeAll(async () => {
  t = await createTestDatabase();
  userA = await t.createUser("workload-a@example.com");
  await withContext(t.db, { tenantId: tenantA, userId: userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantA, slug: "workload-a", name: "Workload A" });
    await tx.insert(workspaces).values({
      id: workspaceA,
      tenantId: tenantA,
      slug: "default",
      name: "Default",
    });
  });
  await withContext(t.db, { tenantId: tenantB, userId: userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantB, slug: "workload-b", name: "Workload B" });
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

describe("workload records", () => {
  it("returns the inserted hours and hides them from the other tenant", async () => {
    const stored = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      insertWorkload(tx, {
        tenantId: tenantA,
        workspaceId: workspaceA,
        ...fixture,
      }),
    );
    expect(stored).toEqual(fixture);

    const forA = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      listWorkload(tx, workspaceA),
    );
    expect(forA).toEqual([fixture]);

    const forB = await withContext(t.db, { tenantId: tenantB, userId: userA, staff: false }, (tx) =>
      listWorkload(tx, workspaceA),
    );
    expect(forB).toEqual([]);
  });

  it("returns an empty list when the workspace has no rows", async () => {
    const rows = await withContext(t.db, { tenantId: tenantB, userId: userA, staff: false }, async (tx) => {
      const [workspace] = await tx.select({ id: workspaces.id }).from(workspaces);
      if (!workspace) throw new Error("workspace missing");
      return listWorkload(tx, workspace.id);
    });
    expect(rows).toEqual([]);
  });

  it("stores no savings column", async () => {
    const columns = await t.pg.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'workload_categories'
         and column_name ilike '%saving%'`,
    );
    expect(columns.rows).toEqual([]);
  });
});
