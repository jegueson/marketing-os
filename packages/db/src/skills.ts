import { and, desc, eq } from "drizzle-orm";
import { AppError, NotFoundError, ValidationError } from "@marketing-os/core";
import {
  agentDefinitionSchema,
  skillDefinitionSchema,
  type AgentDefinition,
  type SkillDefinition,
  type ToolAllowlistEntry,
} from "@marketing-os/schemas";
import type { Database } from "./context";
import { agents, configVersions, skills, type ConfigResourceType } from "./schema/config";

export type ToolCatalogEntry = { connector: string; tool: string };

export type StoredSkill = {
  id: string;
  status: "draft" | "published";
  activeVersion: number | null;
  draft: SkillDefinition;
};

export type StoredAgent = {
  id: string;
  status: "draft" | "published";
  activeVersion: number | null;
  draft: AgentDefinition;
};

type WorkspaceInput = { tenantId: string; workspaceId: string };
type SkillSaveInput = WorkspaceInput & { draft: unknown; id?: string };
type AgentSaveInput = WorkspaceInput & { draft: unknown; id?: string };
type PublishInput = WorkspaceInput & {
  id: string;
  publishedBy: string;
  catalog: readonly ToolCatalogEntry[];
};

type SkillResource = Extract<ConfigResourceType, "skill">;
type AgentResource = Extract<ConfigResourceType, "agent">;

function toolKey(entry: { connector: string; tool: string }): string {
  return `${entry.connector}::${entry.tool}`;
}

function validationIssues(error: { issues: { path: PropertyKey[]; code: string; message: string }[] }) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    code: issue.code,
    message: issue.message,
  }));
}

function parseSkillDraft(draft: unknown): SkillDefinition {
  const parsed = skillDefinitionSchema.safeParse(draft);
  if (!parsed.success) {
    throw new ValidationError("Skill draft is invalid", { issues: validationIssues(parsed.error) });
  }
  return parsed.data;
}

function parseAgentDraft(draft: unknown): AgentDefinition {
  const parsed = agentDefinitionSchema.safeParse(draft);
  if (!parsed.success) {
    throw new ValidationError("Agent draft is invalid", { issues: validationIssues(parsed.error) });
  }
  return parsed.data;
}

/** Catalog check runs on publish only. A draft may name a tool the catalog does not have. */
function assertToolsInCatalog(tools: readonly ToolAllowlistEntry[], catalog: readonly ToolCatalogEntry[], label: string) {
  const allowed = new Set(catalog.map(toolKey));
  const missing = tools.filter((tool) => !allowed.has(toolKey(tool)));
  if (missing.length === 0) return;
  throw new ValidationError(`${label} names tools missing from the connector catalog`, {
    issues: missing.map((tool) => ({
      path: "tools",
      code: "custom",
      message: `${tool.connector}/${tool.tool} is not in the connector catalog`,
    })),
  });
}

async function nextVersion(
  tx: Database,
  tenantId: string,
  type: SkillResource | AgentResource,
  resourceId: string,
): Promise<number> {
  const [latest] = await tx
    .select({ version: configVersions.version })
    .from(configVersions)
    .where(
      and(
        eq(configVersions.tenantId, tenantId),
        eq(configVersions.resourceType, type),
        eq(configVersions.resourceId, resourceId),
      ),
    )
    .orderBy(desc(configVersions.version))
    .limit(1);
  return (latest?.version ?? 0) + 1;
}

async function appendVersion(
  tx: Database,
  input: PublishInput,
  type: SkillResource | AgentResource,
  document: SkillDefinition | AgentDefinition,
): Promise<number> {
  const version = await nextVersion(tx, input.tenantId, type, input.id);
  await tx.insert(configVersions).values({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    resourceType: type,
    resourceId: input.id,
    version,
    document,
    publishedBy: input.publishedBy,
  });
  return version;
}

async function lockSkill(tx: Database, tenantId: string, id: string) {
  const [row] = await tx
    .select()
    .from(skills)
    .where(and(eq(skills.id, id), eq(skills.tenantId, tenantId)))
    .for("update");
  return row ?? null;
}

async function lockAgent(tx: Database, tenantId: string, id: string) {
  const [row] = await tx
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.tenantId, tenantId)))
    .for("update");
  return row ?? null;
}

export async function saveSkillDraft(tx: Database, input: SkillSaveInput): Promise<StoredSkill> {
  const draft = parseSkillDraft(input.draft);
  if (input.id) {
    const existing = await lockSkill(tx, input.tenantId, input.id);
    if (!existing || existing.workspaceId !== input.workspaceId) {
      throw new NotFoundError("Skill draft not found");
    }
    const updated = await tx
      .update(skills)
      .set({ draft, status: "draft", updatedAt: new Date() })
      .where(
        and(
          eq(skills.id, input.id),
          eq(skills.tenantId, input.tenantId),
          eq(skills.workspaceId, input.workspaceId),
        ),
      )
      .returning({ id: skills.id });
    if (!updated[0]) throw new NotFoundError("Skill draft not found");
    return {
      id: existing.id,
      status: "draft",
      activeVersion: existing.activeVersion,
      draft,
    };
  }
  const [row] = await tx
    .insert(skills)
    .values({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      status: "draft",
      draft,
    })
    .returning({ id: skills.id });
  if (!row) throw new AppError("internal_error", "Skill draft was not stored", 500);
  return { id: row.id, status: "draft", activeVersion: null, draft };
}

export async function saveAgentDraft(tx: Database, input: AgentSaveInput): Promise<StoredAgent> {
  const draft = parseAgentDraft(input.draft);
  if (input.id) {
    const existing = await lockAgent(tx, input.tenantId, input.id);
    if (!existing || existing.workspaceId !== input.workspaceId) {
      throw new NotFoundError("Agent draft not found");
    }
    const updated = await tx
      .update(agents)
      .set({ draft, status: "draft", updatedAt: new Date() })
      .where(
        and(
          eq(agents.id, input.id),
          eq(agents.tenantId, input.tenantId),
          eq(agents.workspaceId, input.workspaceId),
        ),
      )
      .returning({ id: agents.id });
    if (!updated[0]) throw new NotFoundError("Agent draft not found");
    return {
      id: existing.id,
      status: "draft",
      activeVersion: existing.activeVersion,
      draft,
    };
  }
  const [row] = await tx
    .insert(agents)
    .values({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      status: "draft",
      draft,
    })
    .returning({ id: agents.id });
  if (!row) throw new AppError("internal_error", "Agent draft was not stored", 500);
  return { id: row.id, status: "draft", activeVersion: null, draft };
}

/** Finds a skill row whose draft name matches. Low volume scan is fine for Sprint 4. */
export async function findSkillByName(
  tx: Database,
  input: WorkspaceInput & { name: string },
): Promise<StoredSkill | null> {
  const rows = await tx
    .select()
    .from(skills)
    .where(and(eq(skills.tenantId, input.tenantId), eq(skills.workspaceId, input.workspaceId)));
  for (const row of rows) {
    const parsed = skillDefinitionSchema.safeParse(row.draft);
    if (!parsed.success) continue;
    if (parsed.data.name !== input.name) continue;
    return {
      id: row.id,
      status: row.status,
      activeVersion: row.activeVersion,
      draft: parsed.data,
    };
  }
  return null;
}

export async function loadActiveSkillDocument(
  tx: Database,
  input: WorkspaceInput & { skillId: string },
): Promise<{ version: number; document: SkillDefinition } | null> {
  const [row] = await tx
    .select({
      version: skills.activeVersion,
      document: configVersions.document,
    })
    .from(skills)
    .innerJoin(
      configVersions,
      and(
        eq(configVersions.tenantId, skills.tenantId),
        eq(configVersions.workspaceId, skills.workspaceId),
        eq(configVersions.resourceType, "skill"),
        eq(configVersions.resourceId, skills.id),
        eq(configVersions.version, skills.activeVersion),
      ),
    )
    .where(
      and(
        eq(skills.id, input.skillId),
        eq(skills.tenantId, input.tenantId),
        eq(skills.workspaceId, input.workspaceId),
        eq(skills.status, "published"),
      ),
    )
    .limit(1);
  if (!row || row.version == null) return null;
  const parsed = skillDefinitionSchema.safeParse(row.document);
  if (!parsed.success) return null;
  return { version: row.version, document: parsed.data };
}

export async function publishSkill(
  tx: Database,
  input: PublishInput,
): Promise<{ version: number; skillId: string }> {
  const existing = await lockSkill(tx, input.tenantId, input.id);
  if (!existing || existing.workspaceId !== input.workspaceId) {
    throw new NotFoundError("Skill draft not found");
  }
  const document = parseSkillDraft(existing.draft);
  assertToolsInCatalog(document.tools, input.catalog, "Skill");
  const version = await appendVersion(tx, input, "skill", document);
  const updated = await tx
    .update(skills)
    .set({
      draft: document,
      status: "published",
      activeVersion: version,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(skills.id, input.id),
        eq(skills.tenantId, input.tenantId),
        eq(skills.workspaceId, input.workspaceId),
      ),
    )
    .returning({ id: skills.id });
  if (!updated[0]) throw new NotFoundError("Skill draft not found");
  return { version, skillId: existing.id };
}

/**
 * Finds the published skill document for each `{ name, version }` ref in this
 * workspace. Missing refs fail publish; they do not fall back to a draft.
 */
async function publishedSkillDocuments(
  tx: Database,
  input: WorkspaceInput,
  refs: readonly { name: string; version: string }[],
): Promise<SkillDefinition[]> {
  const rows = await tx
    .select({ document: configVersions.document })
    .from(configVersions)
    .where(
      and(
        eq(configVersions.tenantId, input.tenantId),
        eq(configVersions.workspaceId, input.workspaceId),
        eq(configVersions.resourceType, "skill"),
      ),
    )
    .orderBy(desc(configVersions.version));
  const byNameVersion = new Map<string, SkillDefinition>();
  for (const row of rows) {
    const parsed = skillDefinitionSchema.safeParse(row.document);
    if (!parsed.success) continue;
    byNameVersion.set(`${parsed.data.name}@${parsed.data.version}`, parsed.data);
  }
  const documents: SkillDefinition[] = [];
  const missing: string[] = [];
  for (const ref of refs) {
    const key = `${ref.name}@${ref.version}`;
    const document = byNameVersion.get(key);
    if (!document) {
      missing.push(key);
      continue;
    }
    documents.push(document);
  }
  if (missing.length > 0) {
    throw new ValidationError("Agent references skills that are not published", {
      issues: missing.map((name) => ({
        path: "skills",
        code: "custom",
        message: `${name} is not a published skill in this workspace`,
      })),
    });
  }
  return documents;
}

function assertAgentToolsOnSkills(agentTools: readonly ToolAllowlistEntry[], skillDocs: readonly SkillDefinition[]) {
  const allowed = new Set(skillDocs.flatMap((skill) => skill.tools.map(toolKey)));
  const outside = agentTools.filter((tool) => !allowed.has(toolKey(tool)));
  if (outside.length === 0) return;
  throw new ValidationError("Agent tools must be a subset of its published skills' tools", {
    issues: outside.map((tool) => ({
      path: "tools",
      code: "custom",
      message: `${tool.connector}/${tool.tool} is not on any of the agent's published skills`,
    })),
  });
}

export async function publishAgent(
  tx: Database,
  input: PublishInput,
): Promise<{ version: number; agentId: string }> {
  const existing = await lockAgent(tx, input.tenantId, input.id);
  if (!existing || existing.workspaceId !== input.workspaceId) {
    throw new NotFoundError("Agent draft not found");
  }
  const document = parseAgentDraft(existing.draft);
  assertToolsInCatalog(document.tools, input.catalog, "Agent");
  const skillDocs = await publishedSkillDocuments(tx, input, document.skills);
  assertAgentToolsOnSkills(document.tools, skillDocs);
  const version = await appendVersion(tx, input, "agent", document);
  const updated = await tx
    .update(agents)
    .set({
      draft: document,
      status: "published",
      activeVersion: version,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(agents.id, input.id),
        eq(agents.tenantId, input.tenantId),
        eq(agents.workspaceId, input.workspaceId),
      ),
    )
    .returning({ id: agents.id });
  if (!updated[0]) throw new NotFoundError("Agent draft not found");
  return { version, agentId: existing.id };
}
