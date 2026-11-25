import { and, desc, eq } from "drizzle-orm";
import { AppError, NotFoundError } from "@marketing-os/core";
import { policyDefinitionSchema, type PolicyDefinition } from "@marketing-os/policy";
import type { Database } from "./context";
import { configVersions, policies } from "./schema/config";

type WorkspaceInput = { tenantId: string; workspaceId: string };

export type StoredPolicy = {
  id: string;
  status: "draft" | "published";
  activeVersion: number | null;
  draft: PolicyDefinition;
};

function parsePolicyDraft(draft: unknown): PolicyDefinition {
  const parsed = policyDefinitionSchema.safeParse(draft);
  if (!parsed.success) {
    throw new AppError("validation_error", "Policy draft is invalid", 422);
  }
  return parsed.data;
}

/** Finds a policy row whose draft name matches. */
export async function findPolicyByName(
  tx: Database,
  input: WorkspaceInput & { name: string },
): Promise<StoredPolicy | null> {
  const rows = await tx
    .select()
    .from(policies)
    .where(and(eq(policies.tenantId, input.tenantId), eq(policies.workspaceId, input.workspaceId)));
  for (const row of rows) {
    const parsed = policyDefinitionSchema.safeParse(row.draft);
    if (!parsed.success || parsed.data.name !== input.name) continue;
    return {
      id: row.id,
      status: row.status,
      activeVersion: row.activeVersion,
      draft: parsed.data,
    };
  }
  return null;
}

export async function savePolicyDraft(
  tx: Database,
  input: WorkspaceInput & { draft: PolicyDefinition; id?: string },
): Promise<StoredPolicy> {
  const draft = parsePolicyDraft(input.draft);
  if (input.id) {
    const [updated] = await tx
      .update(policies)
      .set({ draft, status: "draft", updatedAt: new Date() })
      .where(
        and(
          eq(policies.id, input.id),
          eq(policies.tenantId, input.tenantId),
          eq(policies.workspaceId, input.workspaceId),
        ),
      )
      .returning({ id: policies.id, activeVersion: policies.activeVersion });
    if (!updated) throw new NotFoundError("Policy draft not found");
    return { id: updated.id, status: "draft", activeVersion: updated.activeVersion, draft };
  }
  const [row] = await tx
    .insert(policies)
    .values({ tenantId: input.tenantId, workspaceId: input.workspaceId, status: "draft", draft })
    .returning({ id: policies.id });
  if (!row) throw new AppError("internal_error", "Policy draft was not stored", 500);
  return { id: row.id, status: "draft", activeVersion: null, draft };
}

export async function publishPolicy(
  tx: Database,
  input: WorkspaceInput & { id: string; publishedBy: string },
): Promise<{ version: number; policyId: string }> {
  const [existing] = await tx
    .select()
    .from(policies)
    .where(and(eq(policies.id, input.id), eq(policies.tenantId, input.tenantId)))
    .for("update");
  if (!existing || existing.workspaceId !== input.workspaceId) {
    throw new NotFoundError("Policy draft not found");
  }
  const document = parsePolicyDraft(existing.draft);
  const [latest] = await tx
    .select({ version: configVersions.version })
    .from(configVersions)
    .where(
      and(
        eq(configVersions.tenantId, input.tenantId),
        eq(configVersions.resourceType, "policy"),
        eq(configVersions.resourceId, input.id),
      ),
    )
    .orderBy(desc(configVersions.version))
    .limit(1);
  const version = (latest?.version ?? 0) + 1;
  await tx.insert(configVersions).values({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    resourceType: "policy",
    resourceId: input.id,
    version,
    document,
    publishedBy: input.publishedBy,
  });
  const [updated] = await tx
    .update(policies)
    .set({ draft: document, status: "published", activeVersion: version, updatedAt: new Date() })
    .where(
      and(
        eq(policies.id, input.id),
        eq(policies.tenantId, input.tenantId),
        eq(policies.workspaceId, input.workspaceId),
      ),
    )
    .returning({ id: policies.id });
  if (!updated) throw new NotFoundError("Policy draft not found");
  return { version, policyId: existing.id };
}

export async function loadActivePolicyDocument(
  tx: Database,
  input: WorkspaceInput & { policyId: string },
): Promise<{ version: number; document: PolicyDefinition } | null> {
  const [row] = await tx
    .select({ version: policies.activeVersion, document: configVersions.document })
    .from(policies)
    .innerJoin(
      configVersions,
      and(
        eq(configVersions.tenantId, policies.tenantId),
        eq(configVersions.workspaceId, policies.workspaceId),
        eq(configVersions.resourceType, "policy"),
        eq(configVersions.resourceId, policies.id),
        eq(configVersions.version, policies.activeVersion),
      ),
    )
    .where(
      and(
        eq(policies.id, input.policyId),
        eq(policies.tenantId, input.tenantId),
        eq(policies.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!row || row.version == null) return null;
  const parsed = policyDefinitionSchema.safeParse(row.document);
  if (!parsed.success) return null;
  return { version: row.version, document: parsed.data };
}
