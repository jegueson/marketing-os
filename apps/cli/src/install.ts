import { and, eq } from "drizzle-orm";
import {
  auditEvents,
  profiles,
  setTenant,
  tenantMemberships,
  tenants,
  withContext,
  workspaces,
  type Database,
} from "@marketing-os/db";

export type InstallInput = {
  adminUserId: string;
  adminEmail: string;
  tenantName: string;
  tenantSlug: string;
};

export type InstallResult = { tenantId: string; workspaceId: string; created: boolean };

/**
 * Creates the first tenant, its default workspace and the admin membership.
 * Every step reuses existing rows, so a second run changes nothing.
 */
export async function provisionInstall(db: Database, input: InstallInput): Promise<InstallResult> {
  return withContext(db, { tenantId: null, userId: input.adminUserId, staff: true }, async (tx) => {
    await tx
      .insert(profiles)
      .values({ id: input.adminUserId, email: input.adminEmail })
      .onConflictDoNothing({ target: profiles.id });

    const [existing] = await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, input.tenantSlug));
    const tenantId = existing?.id ?? crypto.randomUUID();
    await setTenant(tx, tenantId);
    if (!existing) {
      await tx.insert(tenants).values({ id: tenantId, slug: input.tenantSlug, name: input.tenantName });
    }

    const [workspace] = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.tenantId, tenantId), eq(workspaces.slug, "default")));
    const workspaceId =
      workspace?.id ??
      (await tx
        .insert(workspaces)
        .values({ tenantId, slug: "default", name: "Default" })
        .returning({ id: workspaces.id }))[0]!.id;

    const inserted = await tx
      .insert(tenantMemberships)
      .values({ tenantId, userId: input.adminUserId, role: "customer_admin" })
      .onConflictDoNothing({ target: [tenantMemberships.tenantId, tenantMemberships.userId] })
      .returning({ id: tenantMemberships.id });

    const created = !existing || inserted.length > 0;
    if (created) {
      await tx.insert(auditEvents).values({
        eventType: "setup.completed",
        tenantId,
        workspaceId,
        actorId: input.adminUserId,
        actorRole: "platform_admin",
        resourceType: "tenant",
        resourceId: tenantId,
      });
    }
    return { tenantId, workspaceId, created };
  });
}
