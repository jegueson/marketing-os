import { and, desc, eq } from "drizzle-orm";
import { AppError, NotFoundError, ValidationError } from "@marketing-os/core";
import {
  brandProfileSchema,
  businessProfileSchema,
  type BrandProfile,
  type BusinessProfile,
} from "@marketing-os/schemas";
import type { Database } from "./context";
import { brandProfiles, businessProfiles, configVersions, type ConfigResourceType } from "./schema/config";

export type ProfileKind = "business" | "brand";
export type ProfileDraft = BusinessProfile | BrandProfile;

export type StoredProfile = {
  id: string;
  kind: ProfileKind;
  status: "draft" | "published";
  activeVersion: number | null;
  draft: ProfileDraft;
};

type ProfileInput = {
  tenantId: string;
  workspaceId: string;
  kind: ProfileKind;
};

type PublishInput = ProfileInput & { publishedBy: string };

type RollbackInput = PublishInput & { toVersion: number };

type ResourceType = Extract<ConfigResourceType, "business_profile" | "brand_profile">;

/** Rejects a document before any insert or update. Unknown keys fail closed. */
function parseDraft(kind: ProfileKind, draft: unknown): ProfileDraft {
  const parsed = (kind === "business" ? businessProfileSchema : brandProfileSchema).safeParse(draft);
  if (!parsed.success) {
    throw new ValidationError("Profile draft is invalid", {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        code: issue.code,
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

function resourceType(kind: ProfileKind): ResourceType {
  return kind === "business" ? "business_profile" : "brand_profile";
}

async function lockBusiness(tx: Database, tenantId: string, workspaceId: string) {
  const [row] = await tx
    .select()
    .from(businessProfiles)
    .where(and(eq(businessProfiles.tenantId, tenantId), eq(businessProfiles.workspaceId, workspaceId)))
    .for("update");
  return row ?? null;
}

async function lockBrand(tx: Database, tenantId: string, workspaceId: string) {
  const [row] = await tx
    .select()
    .from(brandProfiles)
    .where(and(eq(brandProfiles.tenantId, tenantId), eq(brandProfiles.workspaceId, workspaceId)))
    .for("update");
  return row ?? null;
}

async function lockProfile(tx: Database, input: ProfileInput) {
  return input.kind === "business"
    ? lockBusiness(tx, input.tenantId, input.workspaceId)
    : lockBrand(tx, input.tenantId, input.workspaceId);
}

async function nextVersion(
  tx: Database,
  tenantId: string,
  type: ResourceType,
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

/** Inserts a new published snapshot. Published rows are never updated. */
async function appendVersion(
  tx: Database,
  input: PublishInput,
  resourceId: string,
  document: ProfileDraft,
): Promise<number> {
  const type = resourceType(input.kind);
  const version = await nextVersion(tx, input.tenantId, type, resourceId);
  await tx.insert(configVersions).values({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    resourceType: type,
    resourceId,
    version,
    document,
    publishedBy: input.publishedBy,
  });
  return version;
}

async function markPublished(
  tx: Database,
  input: ProfileInput,
  profileId: string,
  document: ProfileDraft,
  version: number,
): Promise<void> {
  const patch = {
    draft: document,
    status: "published" as const,
    activeVersion: version,
    updatedAt: new Date(),
  };
  const updated =
    input.kind === "business"
      ? await tx
          .update(businessProfiles)
          .set(patch)
          .where(and(eq(businessProfiles.id, profileId), eq(businessProfiles.tenantId, input.tenantId)))
          .returning({ id: businessProfiles.id })
      : await tx
          .update(brandProfiles)
          .set(patch)
          .where(and(eq(brandProfiles.id, profileId), eq(brandProfiles.tenantId, input.tenantId)))
          .returning({ id: brandProfiles.id });
  if (!updated[0]) {
    throw new NotFoundError("Profile draft not found");
  }
}

export async function saveProfileDraft(
  tx: Database,
  input: ProfileInput & { draft: unknown },
): Promise<StoredProfile> {
  const draft = parseDraft(input.kind, input.draft);
  const existing = await lockProfile(tx, input);
  if (!existing) {
    const created = await insertDraft(tx, input, draft);
    return { id: created.id, kind: input.kind, status: "draft", activeVersion: null, draft };
  }
  await updateDraft(tx, input, existing.id, draft);
  return {
    id: existing.id,
    kind: input.kind,
    status: "draft",
    activeVersion: existing.activeVersion,
    draft,
  };
}

async function insertDraft(tx: Database, input: ProfileInput, draft: ProfileDraft) {
  const values = {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    status: "draft" as const,
    draft,
  };
  const [row] =
    input.kind === "business"
      ? await tx.insert(businessProfiles).values(values).returning({ id: businessProfiles.id })
      : await tx.insert(brandProfiles).values(values).returning({ id: brandProfiles.id });
  if (!row) {
    throw new AppError("internal_error", "Profile draft was not stored", 500);
  }
  return row;
}

async function updateDraft(tx: Database, input: ProfileInput, profileId: string, draft: ProfileDraft) {
  const patch = { draft, status: "draft" as const, updatedAt: new Date() };
  const updated =
    input.kind === "business"
      ? await tx
          .update(businessProfiles)
          .set(patch)
          .where(and(eq(businessProfiles.id, profileId), eq(businessProfiles.tenantId, input.tenantId)))
          .returning({ id: businessProfiles.id })
      : await tx
          .update(brandProfiles)
          .set(patch)
          .where(and(eq(brandProfiles.id, profileId), eq(brandProfiles.tenantId, input.tenantId)))
          .returning({ id: brandProfiles.id });
  if (!updated[0]) {
    throw new NotFoundError("Profile draft not found");
  }
}

export async function publishProfile(
  tx: Database,
  input: PublishInput,
): Promise<{ version: number; profileId: string }> {
  const existing = await lockProfile(tx, input);
  if (!existing) {
    throw new NotFoundError("Profile draft not found");
  }
  const document = parseDraft(input.kind, existing.draft);
  const version = await appendVersion(tx, input, existing.id, document);
  await markPublished(tx, input, existing.id, document, version);
  return { version, profileId: existing.id };
}

export async function rollbackProfile(tx: Database, input: RollbackInput): Promise<{ version: number }> {
  const existing = await lockProfile(tx, input);
  if (!existing) {
    throw new NotFoundError("Profile draft not found");
  }
  const [previous] = await tx
    .select()
    .from(configVersions)
    .where(
      and(
        eq(configVersions.tenantId, input.tenantId),
        eq(configVersions.resourceType, resourceType(input.kind)),
        eq(configVersions.resourceId, existing.id),
        eq(configVersions.version, input.toVersion),
      ),
    );
  if (!previous) {
    throw new NotFoundError("Published profile version not found");
  }
  const document = parseDraft(input.kind, previous.document);
  const version = await appendVersion(tx, input, existing.id, document);
  await markPublished(tx, input, existing.id, document, version);
  return { version };
}
