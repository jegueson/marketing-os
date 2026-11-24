import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  codePromptRegistry,
  hashTenantPrompt,
  tenantAwarePromptRegistry,
} from "@marketing-os/prompts";
import { withContext, type DbContext } from "./context";
import { insertTenantPrompt, listTenantPrompts } from "./tenant-prompts";
import { tenantMemberships, tenants, workspaces } from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
const ids = {
  tenantA: crypto.randomUUID(),
  workspaceA: crypto.randomUUID(),
  userA: "",
};

const ctxA = (): DbContext => ({ tenantId: ids.tenantA, userId: ids.userA, staff: false });

const model = {
  structuredOutput: "none" as const,
  temperatureMax: 0.2,
  minContextWindow: 4_000,
};

beforeAll(async () => {
  t = await createTestDatabase();
  ids.userA = await t.createUser("prompts-a@example.com");
  await withContext(t.db, { tenantId: ids.tenantA, userId: ids.userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: ids.tenantA, slug: "prompts-a", name: "Prompts A" });
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

describe("tenant prompts in the database", () => {
  it("loads a tenant prompt into PromptRegistry and keeps ask.plan on code", async () => {
    const body = {
      name: "tenant/weekly-review",
      version: "1.0.0",
      purpose: "reporting",
      system: "Write the weekly performance review from the fenced context.",
      model,
    };
    const prompt = { ...body, contentHash: await hashTenantPrompt(body) };

    await withContext(t.db, ctxA(), (tx) =>
      insertTenantPrompt(tx, {
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        prompt,
      }),
    );

    const rows = await withContext(t.db, ctxA(), (tx) =>
      listTenantPrompts(tx, { tenantId: ids.tenantA, workspaceId: ids.workspaceA }),
    );
    expect(rows).toHaveLength(1);

    const registry = await tenantAwarePromptRegistry(rows);
    expect(registry.get("ask.plan", "1").system).toBe(codePromptRegistry().get("ask.plan", "1").system);
    expect(registry.get("tenant/weekly-review", "1.0.0").system).toContain("weekly performance review");
  });

  it("refuses a platform prompt name at insert time", async () => {
    await expect(
      withContext(t.db, ctxA(), (tx) =>
        insertTenantPrompt(tx, {
          tenantId: ids.tenantA,
          workspaceId: ids.workspaceA,
          prompt: {
            name: "ask.plan",
            version: "1.0.0",
            purpose: "ask",
            system: "Shadow",
            contentHash: "a".repeat(64),
            model,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
