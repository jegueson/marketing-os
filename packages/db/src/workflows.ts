import { and, desc, eq } from "drizzle-orm";
import { AppError, NotFoundError, ValidationError } from "@marketing-os/core";
import { workflowDefinitionSchema, type WorkflowDefinition } from "@marketing-os/schemas";
import type { Database } from "./context";
import { configVersions, workflows, type ConfigResourceType } from "./schema/config";

export type StoredWorkflow = {
  id: string;
  status: "draft" | "published";
  activeVersion: number | null;
  draft: WorkflowDefinition;
};

type WorkspaceInput = { tenantId: string; workspaceId: string };
type WorkflowSaveInput = WorkspaceInput & { draft: unknown; id?: string };
type PublishInput = WorkspaceInput & { id: string; publishedBy: string };

type WorkflowResource = Extract<ConfigResourceType, "workflow">;

function validationIssues(error: { issues: { path: PropertyKey[]; code: string; message: string }[] }) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    code: issue.code,
    message: issue.message,
  }));
}

function parseWorkflowDraft(draft: unknown): WorkflowDefinition {
  const parsed = workflowDefinitionSchema.safeParse(draft);
  if (!parsed.success) {
    throw new ValidationError("Workflow draft is invalid", { issues: validationIssues(parsed.error) });
  }
  return parsed.data;
}

async function nextVersion(tx: Database, tenantId: string, resourceId: string): Promise<number> {
  const [latest] = await tx
    .select({ version: configVersions.version })
    .from(configVersions)
    .where(
      and(
        eq(configVersions.tenantId, tenantId),
        eq(configVersions.resourceType, "workflow"),
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
  document: WorkflowDefinition,
): Promise<number> {
  const version = await nextVersion(tx, input.tenantId, input.id);
  await tx.insert(configVersions).values({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    resourceType: "workflow" satisfies WorkflowResource,
    resourceId: input.id,
    version,
    document,
    publishedBy: input.publishedBy,
  });
  return version;
}

async function lockWorkflow(tx: Database, tenantId: string, id: string) {
  const [row] = await tx
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, id), eq(workflows.tenantId, tenantId)))
    .for("update");
  return row ?? null;
}

/** Finds a workflow row whose draft name matches. Low volume scan is fine for Sprint 4. */
export async function findWorkflowByName(
  tx: Database,
  input: WorkspaceInput & { name: string },
): Promise<StoredWorkflow | null> {
  const rows = await tx
    .select()
    .from(workflows)
    .where(and(eq(workflows.tenantId, input.tenantId), eq(workflows.workspaceId, input.workspaceId)));
  for (const row of rows) {
    const parsed = workflowDefinitionSchema.safeParse(row.draft);
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

export async function saveWorkflowDraft(tx: Database, input: WorkflowSaveInput): Promise<StoredWorkflow> {
  const draft = parseWorkflowDraft(input.draft);
  if (input.id) {
    const existing = await lockWorkflow(tx, input.tenantId, input.id);
    if (!existing || existing.workspaceId !== input.workspaceId) {
      throw new NotFoundError("Workflow draft not found");
    }
    const updated = await tx
      .update(workflows)
      .set({ draft, status: "draft", updatedAt: new Date() })
      .where(
        and(
          eq(workflows.id, input.id),
          eq(workflows.tenantId, input.tenantId),
          eq(workflows.workspaceId, input.workspaceId),
        ),
      )
      .returning({ id: workflows.id });
    if (!updated[0]) throw new NotFoundError("Workflow draft not found");
    return {
      id: existing.id,
      status: "draft",
      activeVersion: existing.activeVersion,
      draft,
    };
  }
  const [row] = await tx
    .insert(workflows)
    .values({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      status: "draft",
      draft,
    })
    .returning({ id: workflows.id });
  if (!row) throw new AppError("internal_error", "Workflow draft was not stored", 500);
  return { id: row.id, status: "draft", activeVersion: null, draft };
}

export async function publishWorkflow(
  tx: Database,
  input: PublishInput,
): Promise<{ version: number; workflowId: string }> {
  const existing = await lockWorkflow(tx, input.tenantId, input.id);
  if (!existing || existing.workspaceId !== input.workspaceId) {
    throw new NotFoundError("Workflow draft not found");
  }
  const document = parseWorkflowDraft(existing.draft);
  const version = await appendVersion(tx, input, document);
  const updated = await tx
    .update(workflows)
    .set({
      draft: document,
      status: "published",
      activeVersion: version,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflows.id, input.id),
        eq(workflows.tenantId, input.tenantId),
        eq(workflows.workspaceId, input.workspaceId),
      ),
    )
    .returning({ id: workflows.id });
  if (!updated[0]) throw new NotFoundError("Workflow draft not found");
  return { version, workflowId: existing.id };
}

export async function loadActiveWorkflowDocument(
  tx: Database,
  input: WorkspaceInput & { workflowId: string },
): Promise<{ version: number; document: WorkflowDefinition } | null> {
  const [row] = await tx
    .select({
      version: workflows.activeVersion,
      document: configVersions.document,
    })
    .from(workflows)
    .innerJoin(
      configVersions,
      and(
        eq(configVersions.tenantId, workflows.tenantId),
        eq(configVersions.workspaceId, workflows.workspaceId),
        eq(configVersions.resourceType, "workflow"),
        eq(configVersions.resourceId, workflows.id),
        eq(configVersions.version, workflows.activeVersion),
      ),
    )
    .where(
      and(
        eq(workflows.id, input.workflowId),
        eq(workflows.tenantId, input.tenantId),
        eq(workflows.workspaceId, input.workspaceId),
        eq(workflows.status, "published"),
      ),
    )
    .limit(1);
  if (!row || row.version == null) return null;
  const parsed = workflowDefinitionSchema.safeParse(row.document);
  if (!parsed.success) return null;
  return { version: row.version, document: parsed.data };
}
