import { and, desc, eq } from "drizzle-orm";
import { NotFoundError, ValidationError } from "@marketing-os/core";
import {
  brandProfileSchema,
  businessProfileSchema,
  skillDefinitionSchema,
  workflowDefinitionSchema,
  type BrandProfile,
  type BusinessProfile,
  type SkillDefinition,
  type WorkflowDefinition,
} from "@marketing-os/schemas";
import type { Database } from "./context";
import {
  brandProfiles,
  businessProfiles,
  configVersions,
  workflows,
} from "./schema/config";
import {
  workflowRuns,
  type WorkflowRunReportRow,
  type WorkflowRunStatus,
  type WorkflowRunStepRow,
  type WorkflowRunTrigger,
} from "./schema/workflow-runs";

export type StoredWorkflowRun = {
  id: string;
  tenantId: string;
  workspaceId: string;
  workflowId: string;
  workflowVersion: number;
  trigger: WorkflowRunTrigger;
  status: WorkflowRunStatus;
  errorCode: string | null;
  steps: WorkflowRunStepRow[];
  report: WorkflowRunReportRow | null;
  createdAt: string;
  updatedAt: string;
};

export type PublishedWorkflow = {
  id: string;
  version: number;
  definition: WorkflowDefinition;
};

type Scope = {
  tenantId: string;
  workspaceId: string;
};

function toStored(row: typeof workflowRuns.$inferSelect): StoredWorkflowRun {
  return {
    id: row.id,
    tenantId: row.tenantId,
    workspaceId: row.workspaceId,
    workflowId: row.workflowId,
    workflowVersion: row.workflowVersion,
    trigger: row.trigger,
    status: row.status,
    errorCode: row.errorCode,
    steps: row.steps.map((step) => ({ ...step })),
    report: row.report ? { ...row.report } : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Loads the active published workflow document for a workspace row. */
export async function loadPublishedWorkflow(
  tx: Database,
  input: Scope & { workflowId: string },
): Promise<PublishedWorkflow> {
  const [row] = await tx
    .select({
      id: workflows.id,
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
  if (!row || row.version == null) {
    throw new NotFoundError("Published workflow not found");
  }
  const parsed = workflowDefinitionSchema.safeParse(row.document);
  if (!parsed.success) {
    throw new ValidationError("Published workflow document is invalid", {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        code: issue.code,
        message: issue.message,
      })),
    });
  }
  return { id: row.id, version: row.version, definition: parsed.data };
}

/** Finds one published skill by name@version inside the workspace. */
export async function loadPublishedSkill(
  tx: Database,
  input: Scope & { name: string; version: string },
): Promise<SkillDefinition | null> {
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
  const key = `${input.name}@${input.version}`;
  for (const row of rows) {
    const parsed = skillDefinitionSchema.safeParse(row.document);
    if (!parsed.success) continue;
    if (`${parsed.data.name}@${parsed.data.version}` === key) return parsed.data;
  }
  return null;
}

async function loadPublishedProfileDocument(
  tx: Database,
  input: Scope & { kind: "business" | "brand" },
): Promise<unknown | null> {
  if (input.kind === "business") {
    const [profile] = await tx
      .select({
        id: businessProfiles.id,
        version: businessProfiles.activeVersion,
      })
      .from(businessProfiles)
      .where(
        and(
          eq(businessProfiles.tenantId, input.tenantId),
          eq(businessProfiles.workspaceId, input.workspaceId),
          eq(businessProfiles.status, "published"),
        ),
      )
      .limit(1);
    if (!profile || profile.version == null) return null;
    const [version] = await tx
      .select({ document: configVersions.document })
      .from(configVersions)
      .where(
        and(
          eq(configVersions.tenantId, input.tenantId),
          eq(configVersions.workspaceId, input.workspaceId),
          eq(configVersions.resourceType, "business_profile"),
          eq(configVersions.resourceId, profile.id),
          eq(configVersions.version, profile.version),
        ),
      )
      .limit(1);
    return version?.document ?? null;
  }
  const [profile] = await tx
    .select({
      id: brandProfiles.id,
      version: brandProfiles.activeVersion,
    })
    .from(brandProfiles)
    .where(
      and(
        eq(brandProfiles.tenantId, input.tenantId),
        eq(brandProfiles.workspaceId, input.workspaceId),
        eq(brandProfiles.status, "published"),
      ),
    )
    .limit(1);
  if (!profile || profile.version == null) return null;
  const [version] = await tx
    .select({ document: configVersions.document })
    .from(configVersions)
    .where(
      and(
        eq(configVersions.tenantId, input.tenantId),
        eq(configVersions.workspaceId, input.workspaceId),
        eq(configVersions.resourceType, "brand_profile"),
        eq(configVersions.resourceId, profile.id),
        eq(configVersions.version, profile.version),
      ),
    )
    .limit(1);
  return version?.document ?? null;
}

export async function loadPublishedBusinessProfile(
  tx: Database,
  input: Scope,
): Promise<BusinessProfile | null> {
  const document = await loadPublishedProfileDocument(tx, { ...input, kind: "business" });
  if (document == null) return null;
  const parsed = businessProfileSchema.safeParse(document);
  return parsed.success ? parsed.data : null;
}

export async function loadPublishedBrandProfile(
  tx: Database,
  input: Scope,
): Promise<BrandProfile | null> {
  const document = await loadPublishedProfileDocument(tx, { ...input, kind: "brand" });
  if (document == null) return null;
  const parsed = brandProfileSchema.safeParse(document);
  return parsed.success ? parsed.data : null;
}

export async function startWorkflowRun(
  tx: Database,
  input: Scope & {
    workflowId: string;
    workflowVersion: number;
    trigger: "manual";
    createdBy: string | null;
    /** Optional fixed id so ledger usage can bind before the insert. */
    runId?: string;
  },
): Promise<StoredWorkflowRun> {
  const [row] = await tx
    .insert(workflowRuns)
    .values({
      ...(input.runId ? { id: input.runId } : {}),
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      workflowId: input.workflowId,
      workflowVersion: input.workflowVersion,
      trigger: input.trigger,
      status: "queued",
      errorCode: null,
      steps: [],
      report: null,
      createdBy: input.createdBy,
    })
    .returning();
  if (!row) throw new NotFoundError("Workflow run was not stored");
  return toStored(row);
}

export async function getWorkflowRun(
  tx: Database,
  input: Scope & { runId: string },
): Promise<StoredWorkflowRun | null> {
  const [row] = await tx
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.id, input.runId),
        eq(workflowRuns.tenantId, input.tenantId),
        eq(workflowRuns.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  return row ? toStored(row) : null;
}

export async function completeWorkflowRun(
  tx: Database,
  input: Scope & {
    runId: string;
    outcome: {
      status: "succeeded" | "failed";
      errorCode: string | null;
      steps: WorkflowRunStepRow[];
      report: WorkflowRunReportRow | null;
    };
  },
): Promise<StoredWorkflowRun | null> {
  const existing = await getWorkflowRun(tx, input);
  if (!existing) return null;
  if (existing.status !== "queued" && existing.status !== "running") return null;
  const [row] = await tx
    .update(workflowRuns)
    .set({
      status: input.outcome.status,
      errorCode: input.outcome.errorCode,
      steps: input.outcome.steps.map((step) => ({ ...step })),
      report: input.outcome.report ? { ...input.outcome.report } : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflowRuns.id, input.runId),
        eq(workflowRuns.tenantId, input.tenantId),
        eq(workflowRuns.workspaceId, input.workspaceId),
      ),
    )
    .returning();
  return row ? toStored(row) : null;
}
