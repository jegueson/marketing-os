import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { ValidationError } from "@marketing-os/core";
import { withContext, type DbContext } from "./context";
import { publishProfile, rollbackProfile, saveProfileDraft } from "./profiles";
import {
  brandProfiles,
  businessProfiles,
  configVersions,
  tenantMemberships,
  tenants,
  workspaces,
} from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
const ids = {
  tenantA: crypto.randomUUID(),
  workspaceA: crypto.randomUUID(),
  userA: "",
};

const ctxA = (): DbContext => ({ tenantId: ids.tenantA, userId: ids.userA, staff: false });

const businessV1 = {
  companyDescription: "Acme sells workflow software.",
  businessModel: "Subscription",
  products: ["Acme Cloud"],
  markets: ["United Kingdom"],
  businessGoals: ["Grow pipeline"],
  marketingGoals: ["Hold CAC"],
  primaryKpis: ["mock.spend"],
  reportingCadence: "weekly" as const,
};

const businessV2 = {
  ...businessV1,
  companyDescription: "Acme sells the marketing operating system.",
};

beforeAll(async () => {
  t = await createTestDatabase();
  ids.userA = await t.createUser("profiles-a@example.com");
  await withContext(t.db, { tenantId: ids.tenantA, userId: ids.userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: ids.tenantA, slug: "profiles-a", name: "Profiles A" });
    await tx.insert(workspaces).values({
      id: ids.workspaceA,
      tenantId: ids.tenantA,
      slug: "default",
      name: "Default",
    });
    await tx.insert(tenantMemberships).values({
      tenantId: ids.tenantA,
      userId: ids.userA,
      role: "customer_admin",
    });
  });
}, 60_000);

afterAll(async () => {
  await t.close();
});

describe("profile repository", () => {
  it("rejects an invalid draft before writing a row", async () => {
    await expect(
      withContext(t.db, ctxA(), (tx) =>
        saveProfileDraft(tx, {
          tenantId: ids.tenantA,
          workspaceId: ids.workspaceA,
          kind: "business",
          draft: { sql: "select 1" },
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const rows = await withContext(t.db, ctxA(), (tx) => tx.select().from(businessProfiles));
    expect(rows).toEqual([]);
  });

  it("keeps the first published row unchanged and rolls back as a new version", async () => {
    await withContext(t.db, ctxA(), async (tx) => {
      await saveProfileDraft(tx, {
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        kind: "business",
        draft: businessV1,
      });
      await publishProfile(tx, {
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        kind: "business",
        publishedBy: ids.userA,
      });
    });

    const [first] = await withContext(t.db, ctxA(), (tx) =>
      tx
        .select()
        .from(configVersions)
        .where(
          and(
            eq(configVersions.tenantId, ids.tenantA),
            eq(configVersions.resourceType, "business_profile"),
            eq(configVersions.version, 1),
          ),
        ),
    );
    expect(first?.document).toEqual(businessV1);
    expect(first?.version).toBe(1);

    await withContext(t.db, ctxA(), async (tx) => {
      await saveProfileDraft(tx, {
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        kind: "business",
        draft: businessV2,
      });
      const published = await publishProfile(tx, {
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        kind: "business",
        publishedBy: ids.userA,
      });
      expect(published.version).toBe(2);
    });

    const afterSecond = await withContext(t.db, ctxA(), (tx) =>
      tx.select().from(configVersions).where(eq(configVersions.resourceType, "business_profile")),
    );
    const storedFirst = afterSecond.find((row) => row.version === 1);
    expect(storedFirst).toMatchObject({
      id: first?.id,
      version: 1,
      document: businessV1,
      createdAt: first?.createdAt,
    });
    expect(afterSecond.find((row) => row.version === 2)?.document).toEqual(businessV2);

    const rolled = await withContext(t.db, ctxA(), (tx) =>
      rollbackProfile(tx, {
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        kind: "business",
        toVersion: 1,
        publishedBy: ids.userA,
      }),
    );
    expect(rolled.version).toBe(3);

    const afterRollback = await withContext(t.db, ctxA(), (tx) =>
      tx
        .select()
        .from(configVersions)
        .where(
          and(eq(configVersions.resourceType, "business_profile"), eq(configVersions.resourceId, first!.resourceId)),
        ),
    );
    expect(afterRollback.find((row) => row.version === 1)?.document).toEqual(businessV1);
    expect(afterRollback.find((row) => row.version === 2)?.document).toEqual(businessV2);
    expect(afterRollback.find((row) => row.version === 3)?.document).toEqual(businessV1);

    const [profile] = await withContext(t.db, ctxA(), (tx) => tx.select().from(businessProfiles));
    expect(profile).toMatchObject({
      status: "published",
      activeVersion: 3,
      draft: businessV1,
    });

    await expect(
      withContext(t.db, ctxA(), (tx) =>
        tx.update(configVersions).set({ document: businessV2 }).where(eq(configVersions.id, first!.id)),
      ),
    ).rejects.toSatisfy((err: unknown) => {
      const cause = (err as { cause?: { message?: string } }).cause;
      return /immutable|permission denied/i.test(cause?.message ?? "");
    });
  });

  it("does not publish an invalid stored draft", async () => {
    await withContext(t.db, ctxA(), (tx) =>
      tx.insert(brandProfiles).values({
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        draft: { sql: "select 1" },
      }),
    );

    await expect(
      withContext(t.db, ctxA(), (tx) =>
        publishProfile(tx, {
          tenantId: ids.tenantA,
          workspaceId: ids.workspaceA,
          kind: "brand",
          publishedBy: ids.userA,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const versions = await withContext(t.db, ctxA(), (tx) =>
      tx.select().from(configVersions).where(eq(configVersions.resourceType, "brand_profile")),
    );
    expect(versions).toEqual([]);
  });
});
