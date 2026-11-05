import { eq, sql } from "drizzle-orm";
import { ConflictError, NotFoundError } from "@marketing-os/core";
import {
  leads,
  onboardingChecklistItems,
  onboardingProjects,
  setTenant,
  staffAssignments,
  tenants,
  workspaces,
  type Database,
} from "@marketing-os/db";
import type { StaffRole } from "../context";
import { enqueueEvent, recordAudit } from "../lib/events";
import { defaultOnboardingTemplate } from "../lib/onboarding-template";
import { slugify } from "../lib/tokens";
import { issueInvitation, type IssuedInvitation } from "./invitations";

/** Extension point for the private cloud package (billing, credits). No-op here. */
export interface ProvisioningHooks {
  afterProvision(tx: Database, result: ProvisionResult): Promise<void>;
}

export const noopProvisioningHooks: ProvisioningHooks = {
  async afterProvision() {},
};

export type ProvisionResult = {
  tenant: { id: string; slug: string; name: string };
  workspace: { id: string; slug: string; name: string };
  invitation: IssuedInvitation;
};

type Actor = { userId: string; staffRole: StaffRole; requestId: string };

/**
 * Converts a qualified lead into a tenant in one transaction. The caller opens a
 * staff context; this switches `app.tenant_id` to the new tenant before tenant rows.
 */
export async function provisionFromLead(
  tx: Database,
  leadId: string,
  actor: Actor,
  hooks: ProvisioningHooks = noopProvisioningHooks,
): Promise<ProvisionResult> {
  const [lead] = await tx.select().from(leads).where(eq(leads.id, leadId)).for("update");
  if (!lead) throw new NotFoundError("Lead not found");
  if (lead.status === "converted" || lead.convertedTenantId) {
    throw new ConflictError("Lead already converted");
  }
  if (lead.status !== "qualified") {
    throw new ConflictError("Lead must be qualified before conversion");
  }

  const tenantId = crypto.randomUUID();
  await setTenant(tx, tenantId);
  const slug = `${slugify(lead.companyName)}-${tenantId.slice(0, 6)}`;
  const [tenant] = await tx
    .insert(tenants)
    .values({ id: tenantId, slug, name: lead.companyName })
    .returning({ id: tenants.id, slug: tenants.slug, name: tenants.name });
  const [workspace] = await tx
    .insert(workspaces)
    .values({ tenantId, slug: "default", name: "Default" })
    .returning({ id: workspaces.id, slug: workspaces.slug, name: workspaces.name });
  if (!tenant || !workspace) throw new Error("Provisioning insert returned no row");

  await tx.insert(staffAssignments).values({ tenantId, userId: actor.userId, role: actor.staffRole });

  const template = defaultOnboardingTemplate();
  const [project] = await tx
    .insert(onboardingProjects)
    .values({ tenantId, workspaceId: workspace.id, assignedTo: actor.userId })
    .returning({ id: onboardingProjects.id });
  if (!project) throw new Error("Onboarding project insert returned no row");
  await tx.insert(onboardingChecklistItems).values(
    template.checklist.map((item, index) => ({
      tenantId,
      projectId: project.id,
      key: item.key,
      title: item.title,
      description: item.description ?? null,
      sortOrder: index,
    })),
  );

  const invitation = await issueInvitation(tx, {
    tenantId,
    email: lead.email,
    role: "customer_admin",
    invitedBy: actor.userId,
  });

  await tx
    .update(leads)
    .set({ status: "converted", convertedTenantId: tenantId, convertedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(leads.id, leadId));

  await enqueueEvent(tx, "customer.provisioned", tenantId, {
    leadId,
    workspaceId: workspace.id,
    invitationId: invitation.id,
  });
  await recordAudit(tx, {
    eventType: "lead.status_changed",
    actorId: actor.userId,
    actorRole: actor.staffRole,
    resourceType: "lead",
    resourceId: leadId,
    payload: { from: lead.status, to: "converted" },
    requestId: actor.requestId,
  });
  await recordAudit(tx, {
    eventType: "customer.provisioned",
    tenantId,
    workspaceId: workspace.id,
    actorId: actor.userId,
    actorRole: actor.staffRole,
    resourceType: "tenant",
    resourceId: tenantId,
    payload: { leadId },
    requestId: actor.requestId,
  });

  const result: ProvisionResult = { tenant, workspace, invitation };
  await hooks.afterProvision(tx, result);
  return result;
}
