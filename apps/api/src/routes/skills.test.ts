import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditEvents, staffAssignments } from "@marketing-os/db";
import { createHarness, provisionCustomer, type Harness, type ProvisionedCustomer, type TestUser } from "../testing/harness";

const skillDraft = {
  name: "weekly-performance-review",
  version: "1.0.0",
  description: "Compare the primary KPIs with the previous period.",
  domain: "performance",
  inputs: [{ name: "cadence", type: "string", description: "Reporting cadence", required: true }],
  contextRequirements: ["business_profile", "metrics"],
  tools: [{ connector: "mock", tool: "list_campaigns" }],
  instructions: "Use only the metric values in the input. Do not invent numbers.",
  outputs: [{ name: "summary", type: "string", description: "What changed", required: true }],
  evaluationSuite: "weekly-performance-review",
  riskClass: "low",
};

const agentDraft = {
  name: "performance-analyst",
  version: "1.0.0",
  goal: "Explain KPI movement.",
  skills: [{ name: "weekly-performance-review", version: "1.0.0" }],
  tools: [{ connector: "mock", tool: "list_campaigns" }],
  knowledgeSourceIds: [],
  modelPurpose: "analysis",
  autonomy: "observe",
};

describe("skill and agent API", () => {
  let h: Harness;
  let sm: TestUser;
  let specialist: TestUser;
  let acme: ProvisionedCustomer;
  let skillsBase: string;
  let agentsBase: string;

  beforeEach(async () => {
    h = await createHarness();
    sm = await h.user("sm-skills@example.com", "success_manager");
    specialist = await h.user("specialist-skills@example.com", "ai_specialist");
    acme = await provisionCustomer(h, sm, "Acme Skills", "owner-skills@acme.test");
    await h.testDb.db.insert(staffAssignments).values({
      tenantId: acme.tenantId,
      userId: specialist.id,
      role: "ai_specialist",
    });
    skillsBase = `/api/v1/workspaces/${acme.workspaceId}/skills`;
    agentsBase = `/api/v1/workspaces/${acme.workspaceId}/agents`;
  });

  afterEach(() => h.close());

  async function enableConfig(): Promise<void> {
    await h.testDb.pg.query("update feature_flags set is_enabled = true where key = 'specialist_config'");
  }

  it("hides the routes until the flag is on", async () => {
    const hidden = await h.call(skillsBase, { token: specialist.token });
    expect(hidden.status).toBe(404);
    expect(hidden.body.error?.message).toBe("Not found");
    expect((await h.call(agentsBase, { token: specialist.token })).status).toBe(404);
  });

  it("refuses a customer admin publish and hides skills from another tenant", async () => {
    await enableConfig();
    const created = await h.call<{ id: string }>(skillsBase, {
      method: "POST",
      token: specialist.token,
      body: skillDraft,
    });
    expect(created.status).toBe(200);
    const skillId = created.body.data.id;

    expect(
      (
        await h.call(`${skillsBase}/${skillId}/publish`, {
          method: "POST",
          token: acme.admin.token,
        })
      ).status,
    ).toBe(403);

    const published = await h.call<{ version: number; status: string }>(`${skillsBase}/${skillId}/publish`, {
      method: "POST",
      token: specialist.token,
    });
    expect(published.status).toBe(200);
    expect(published.body.data).toEqual({ id: skillId, version: 1, status: "published" });

    const other = await provisionCustomer(h, sm, "Other Skills", "owner-skills@other.test");
    expect(
      (await h.call(`${skillsBase}/${skillId}`, { token: other.admin.token })).status,
    ).toBe(403);
    expect((await h.call(skillsBase, { token: other.admin.token })).status).toBe(403);
    expect((await h.call(agentsBase, { token: other.admin.token })).status).toBe(403);
  });

  it("lets a specialist publish a skill and an observe agent", async () => {
    await enableConfig();

    const skill = await h.call<{ id: string; draft: { name: string } }>(skillsBase, {
      method: "POST",
      token: specialist.token,
      body: skillDraft,
    });
    expect(skill.status).toBe(200);
    expect(skill.body.data.draft.name).toBe(skillDraft.name);

    const skillPublished = await h.call<{ id: string; version: number }>(
      `${skillsBase}/${skill.body.data.id}/publish`,
      { method: "POST", token: specialist.token },
    );
    expect(skillPublished.status).toBe(200);

    const agent = await h.call<{ id: string; draft: { autonomy: string } }>(agentsBase, {
      method: "POST",
      token: specialist.token,
      body: agentDraft,
    });
    expect(agent.status).toBe(200);
    expect(agent.body.data.draft.autonomy).toBe("observe");

    const agentPublished = await h.call<{ id: string; version: number; status: string }>(
      `${agentsBase}/${agent.body.data.id}/publish`,
      { method: "POST", token: specialist.token },
    );
    expect(agentPublished.status).toBe(200);
    expect(agentPublished.body.data).toEqual({
      id: agent.body.data.id,
      version: 1,
      status: "published",
    });

    const listed = await h.call<{ id: string }[]>(agentsBase, { token: specialist.token });
    expect(listed.status).toBe(200);
    expect(listed.body.data.map((row) => row.id)).toContain(agent.body.data.id);

    const skillAudits = await h.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "config.skill_published"));
    expect(skillAudits).toHaveLength(1);
    expect(skillAudits[0]).toMatchObject({
      tenantId: acme.tenantId,
      actorId: specialist.id,
      resourceType: "skill",
      resourceId: skill.body.data.id,
    });
    expect(JSON.stringify(skillAudits[0]?.payload)).not.toContain(skillDraft.instructions);

    const agentAudits = await h.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "config.agent_published"));
    expect(agentAudits).toHaveLength(1);
    expect(agentAudits[0]).toMatchObject({
      tenantId: acme.tenantId,
      actorId: specialist.id,
      resourceType: "agent",
      resourceId: agent.body.data.id,
    });
    expect(JSON.stringify(agentAudits[0]?.payload)).not.toContain(agentDraft.goal);
  });
});
