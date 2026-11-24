import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { ValidationError } from "@marketing-os/core";
import { withContext, type DbContext } from "./context";
import {
  publishAgent,
  publishSkill,
  saveAgentDraft,
  saveSkillDraft,
  type ToolCatalogEntry,
} from "./skills";
import {
  agents,
  configVersions,
  skills,
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

const catalog: ToolCatalogEntry[] = [
  { connector: "mock", tool: "query_metrics" },
  { connector: "mock", tool: "list_metrics" },
];

const skillV1 = {
  name: "weekly-performance-review",
  version: "1.0.0",
  description: "Compare the primary KPIs with the previous period.",
  domain: "performance" as const,
  inputs: [{ name: "cadence", type: "string" as const, description: "Reporting cadence", required: true }],
  contextRequirements: ["business_profile" as const, "metrics" as const],
  tools: [{ connector: "mock", tool: "query_metrics" }],
  instructions: "Use only the metric values in the input. Do not invent numbers.",
  outputs: [{ name: "summary", type: "string" as const, description: "What changed", required: true }],
  evaluationSuite: "weekly-performance-review",
  riskClass: "low" as const,
};

const agentV1 = {
  name: "performance-analyst",
  version: "1.0.0",
  goal: "Explain KPI movement.",
  skills: [{ name: "weekly-performance-review", version: "1.0.0" }],
  tools: [{ connector: "mock", tool: "query_metrics" }],
  knowledgeSourceIds: [] as string[],
  modelPurpose: "analysis" as const,
  autonomy: "observe" as const,
};

beforeAll(async () => {
  t = await createTestDatabase();
  ids.userA = await t.createUser("skills-a@example.com");
  await withContext(t.db, { tenantId: ids.tenantA, userId: ids.userA, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: ids.tenantA, slug: "skills-a", name: "Skills A" });
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

describe("skill and agent repository", () => {
  it("saves a draft that names an unknown tool and refuses to publish it", async () => {
    const unknownTool = {
      ...skillV1,
      name: "unknown-tool-skill",
      tools: [{ connector: "mock", tool: "invented_tool" }],
    };

    const saved = await withContext(t.db, ctxA(), (tx) =>
      saveSkillDraft(tx, {
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        draft: unknownTool,
      }),
    );
    expect(saved.status).toBe("draft");
    expect(saved.draft.tools).toEqual([{ connector: "mock", tool: "invented_tool" }]);

    await expect(
      withContext(t.db, ctxA(), (tx) =>
        publishSkill(tx, {
          tenantId: ids.tenantA,
          workspaceId: ids.workspaceA,
          id: saved.id,
          publishedBy: ids.userA,
          catalog,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const versions = await withContext(t.db, ctxA(), (tx) =>
      tx
        .select()
        .from(configVersions)
        .where(
          and(eq(configVersions.resourceType, "skill"), eq(configVersions.resourceId, saved.id)),
        ),
    );
    expect(versions).toEqual([]);
  });

  it("refuses an agent whose tools are outside its published skills", async () => {
    const skill = await withContext(t.db, ctxA(), async (tx) => {
      const saved = await saveSkillDraft(tx, {
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        draft: skillV1,
      });
      await publishSkill(tx, {
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        id: saved.id,
        publishedBy: ids.userA,
        catalog,
      });
      return saved;
    });

    const outside = {
      ...agentV1,
      name: "outside-tools-agent",
      tools: [
        { connector: "mock", tool: "query_metrics" },
        { connector: "mock", tool: "list_metrics" },
      ],
    };

    const agent = await withContext(t.db, ctxA(), (tx) =>
      saveAgentDraft(tx, {
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        draft: outside,
      }),
    );
    expect(agent.status).toBe("draft");

    await expect(
      withContext(t.db, ctxA(), (tx) =>
        publishAgent(tx, {
          tenantId: ids.tenantA,
          workspaceId: ids.workspaceA,
          id: agent.id,
          publishedBy: ids.userA,
          catalog,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const agentVersions = await withContext(t.db, ctxA(), (tx) =>
      tx
        .select()
        .from(configVersions)
        .where(and(eq(configVersions.resourceType, "agent"), eq(configVersions.resourceId, agent.id))),
    );
    expect(agentVersions).toEqual([]);

    const skillVersions = await withContext(t.db, ctxA(), (tx) =>
      tx
        .select()
        .from(configVersions)
        .where(and(eq(configVersions.resourceType, "skill"), eq(configVersions.resourceId, skill.id))),
    );
    expect(skillVersions).toHaveLength(1);
  });

  it("publishes a skill and an observe agent and keeps published rows immutable", async () => {
    const published = await withContext(t.db, ctxA(), async (tx) => {
      const skill = await saveSkillDraft(tx, {
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        draft: { ...skillV1, name: "publishable-skill" },
      });
      const skillResult = await publishSkill(tx, {
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        id: skill.id,
        publishedBy: ids.userA,
        catalog,
      });
      const agent = await saveAgentDraft(tx, {
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        draft: {
          ...agentV1,
          name: "publishable-agent",
          skills: [{ name: "publishable-skill", version: "1.0.0" }],
        },
      });
      const agentResult = await publishAgent(tx, {
        tenantId: ids.tenantA,
        workspaceId: ids.workspaceA,
        id: agent.id,
        publishedBy: ids.userA,
        catalog,
      });
      return { skill, agent, skillResult, agentResult };
    });

    expect(published.skillResult.version).toBe(1);
    expect(published.agentResult.version).toBe(1);

    const [skillRow] = await withContext(t.db, ctxA(), (tx) =>
      tx.select().from(skills).where(eq(skills.id, published.skill.id)),
    );
    const [agentRow] = await withContext(t.db, ctxA(), (tx) =>
      tx.select().from(agents).where(eq(agents.id, published.agent.id)),
    );
    expect(skillRow).toMatchObject({ status: "published", activeVersion: 1 });
    expect(agentRow).toMatchObject({ status: "published", activeVersion: 1 });

    const [firstSkillVersion] = await withContext(t.db, ctxA(), (tx) =>
      tx
        .select()
        .from(configVersions)
        .where(
          and(
            eq(configVersions.resourceType, "skill"),
            eq(configVersions.resourceId, published.skill.id),
            eq(configVersions.version, 1),
          ),
        ),
    );
    expect(firstSkillVersion).toBeDefined();
    await expect(
      withContext(t.db, ctxA(), (tx) =>
        tx
          .update(configVersions)
          .set({ document: { name: "mutated" } })
          .where(eq(configVersions.id, firstSkillVersion!.id)),
      ),
    ).rejects.toSatisfy((err: unknown) => {
      const cause = (err as { cause?: { message?: string } }).cause;
      return /immutable|permission denied/i.test(cause?.message ?? "");
    });
  });
});
