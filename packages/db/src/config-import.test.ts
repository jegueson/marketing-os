import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { ValidationError } from "@marketing-os/core";
import { parseConfigYaml } from "@marketing-os/config";
import { withContext, type DbContext } from "./context";
import {
  exportActiveConfigYaml,
  importConfigYaml,
  previewConfigImport,
} from "./config-import";
import { configVersions, skills, tenantMemberships, tenants, workflows, workspaces } from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";
import type { ToolCatalogEntry } from "./skills";

let t: TestDatabase;
const ids = {
  tenantA: crypto.randomUUID(),
  workspaceA: crypto.randomUUID(),
  userA: "",
};

const ctxA = (): DbContext => ({ tenantId: ids.tenantA, userId: ids.userA, staff: false });

const catalog: ToolCatalogEntry[] = [{ connector: "mock", tool: "list_campaigns" }];

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const skillSource = readFileSync(
  join(root, "skills/starter/weekly-performance-review/skill.yaml"),
  "utf8",
);
const workflowSource = readFileSync(
  join(root, "customer-configs/examples/weekly-performance-review/workflow.yaml"),
  "utf8",
);
const policySource = readFileSync(
  join(root, "customer-configs/examples/linear-create-issue/policy.yaml"),
  "utf8",
);

beforeAll(async () => {
  t = await createTestDatabase();
  ids.userA = await t.createUser("config-import-a@example.com");
  await withContext(t.db, { tenantId: ids.tenantA, userId: ids.userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: ids.tenantA, slug: "config-import-a", name: "Config Import A" });
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

describe("config YAML import and export", () => {
  it("rejects invalid YAML and publishes nothing", async () => {
    await expect(
      withContext(t.db, ctxA(), (tx) =>
        importConfigYaml(tx, {
          tenantId: ids.tenantA,
          workspaceId: ids.workspaceA,
          publishedBy: ids.userA,
          kind: "skill",
          source: "name: [\n",
          catalog,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const rows = await withContext(t.db, ctxA(), (tx) => tx.select().from(skills));
    expect(rows).toEqual([]);
  });

  it("rejects a tool entry with an action field before writing", async () => {
    const bad = `
name: bad-action-skill
version: 1.0.0
description: Must not publish.
domain: performance
inputs: []
contextRequirements:
  - metrics
tools:
  - connector: mock
    tool: list_campaigns
    action: write_budget
instructions: Do not invent numbers.
outputs:
  - name: summary
    type: string
    description: What changed
    required: true
evaluationSuite: null
riskClass: low
`;
    await expect(
      withContext(t.db, ctxA(), (tx) =>
        importConfigYaml(tx, {
          tenantId: ids.tenantA,
          workspaceId: ids.workspaceA,
          publishedBy: ids.userA,
          kind: "skill",
          source: bad,
          catalog,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const rows = await withContext(t.db, ctxA(), (tx) =>
      tx.select().from(skills).where(eq(skills.tenantId, ids.tenantA)),
    );
    expect(rows).toEqual([]);
  });

  it("imports the weekly review example and round-trips export", async () => {
    const skillImport = await withContext(t.db, ctxA(), (tx) =>
      importConfigYaml(tx, {
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        publishedBy: ids.userA,
        kind: "skill",
        source: skillSource,
        catalog,
      }),
    );
    expect(skillImport).toMatchObject({
      kind: "skill",
      name: "weekly-performance-review",
      version: 1,
    });

    const workflowImport = await withContext(t.db, ctxA(), (tx) =>
      importConfigYaml(tx, {
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        publishedBy: ids.userA,
        kind: "workflow",
        source: workflowSource,
      }),
    );
    expect(workflowImport).toMatchObject({
      kind: "workflow",
      name: "weekly-performance-review",
      version: 1,
    });

    const published = await withContext(t.db, ctxA(), async (tx) => ({
      skills: await tx
        .select()
        .from(skills)
        .where(and(eq(skills.id, skillImport.id), eq(skills.status, "published"))),
      workflows: await tx
        .select()
        .from(workflows)
        .where(and(eq(workflows.id, workflowImport.id), eq(workflows.status, "published"))),
      skillVersions: await tx
        .select()
        .from(configVersions)
        .where(and(eq(configVersions.resourceType, "skill"), eq(configVersions.resourceId, skillImport.id))),
      workflowVersions: await tx
        .select()
        .from(configVersions)
        .where(
          and(eq(configVersions.resourceType, "workflow"), eq(configVersions.resourceId, workflowImport.id)),
        ),
    }));
    expect(published.skills).toHaveLength(1);
    expect(published.workflows).toHaveLength(1);
    expect(published.skillVersions).toHaveLength(1);
    expect(published.workflowVersions).toHaveLength(1);

    const exportedSkill = await withContext(t.db, ctxA(), (tx) =>
      exportActiveConfigYaml(tx, {
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        kind: "skill",
        id: skillImport.id,
      }),
    );
    const exportedWorkflow = await withContext(t.db, ctxA(), (tx) =>
      exportActiveConfigYaml(tx, {
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        kind: "workflow",
        id: workflowImport.id,
      }),
    );
    expect(exportedSkill).not.toBeNull();
    expect(exportedWorkflow).not.toBeNull();
    expect(parseConfigYaml("skill", exportedSkill!).document).toEqual(
      parseConfigYaml("skill", skillSource).document,
    );
    expect(parseConfigYaml("workflow", exportedWorkflow!).document).toEqual(
      parseConfigYaml("workflow", workflowSource).document,
    );

    const preview = await withContext(t.db, ctxA(), (tx) =>
      previewConfigImport(tx, {
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        publishedBy: ids.userA,
        kind: "skill",
        source: skillSource,
      }),
    );
    expect(preview.activeVersion).toBe(1);
    expect(preview.changes).toEqual([]);
  });

  it("publishes nothing when requireApproval is false", async () => {
    const before = await t.pg.query<{ count: string }>(
      "select count(*)::text as count from config_versions where resource_type = 'policy'",
    );
    const source = policySource.replace("requireApproval: true", "requireApproval: false");
    await expect(
      withContext(t.db, ctxA(), (tx) =>
        importConfigYaml(tx, {
          tenantId: ids.tenantA,
          workspaceId: ids.workspaceA,
          publishedBy: ids.userA,
          kind: "policy",
          source,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    const after = await t.pg.query<{ count: string }>(
      "select count(*)::text as count from config_versions where resource_type = 'policy'",
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  it("publishes the example Linear policy and round-trips the export", async () => {
    const imported = await withContext(t.db, ctxA(), (tx) =>
      importConfigYaml(tx, {
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        publishedBy: ids.userA,
        kind: "policy",
        source: policySource,
      }),
    );
    expect(imported).toMatchObject({ kind: "policy", name: "linear-create-issue", version: 1 });
    const exported = await withContext(t.db, ctxA(), (tx) =>
      exportActiveConfigYaml(tx, {
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        kind: "policy",
        id: imported.id,
      }),
    );
    expect(exported).not.toBeNull();
    expect(parseConfigYaml("policy", exported!).document).toEqual(
      parseConfigYaml("policy", policySource).document,
    );
  });
});
