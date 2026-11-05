import { Hono } from "hono";
import { count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { NotFoundError, ValidationError, ok } from "@marketing-os/core";
import {
  auditEvents,
  connections,
  connectors,
  invitations,
  leads,
  opportunities,
  selectRows,
  tenants,
  workspaces,
  type DbContext,
} from "@marketing-os/db";
import { requireAssignedTenant } from "../auth/access";
import { requirePrincipal, requireStaff } from "../auth/principal";
import { run, staffContext, type AppContext, type HonoEnv } from "../context";
import { recordAudit } from "../lib/events";
import { parseUuidParam } from "../lib/http";
import { revokeInvitation, rotateInvitation, sendInvitationEmail } from "../services/invitations";
import { loadOnboarding } from "./onboarding";

export const consoleRoutes = new Hono<HonoEnv>();

const base = "/api/v1/console/customers";

consoleRoutes.use(base, requirePrincipal);
consoleRoutes.use(`${base}/*`, requirePrincipal);

/** Staff reading one assigned tenant: staff flag for staff-only tables, tenant for tenant tables. */
function assignedTenantContext(c: AppContext): DbContext {
  return { tenantId: c.get("access").tenantId, userId: c.get("principal").userId, staff: true };
}

consoleRoutes.get(base, requireStaff("tenants:read"), async (c) => {
  const principal = c.get("principal");
  const items = await run(c, staffContext(principal), async (tx) => {
    let filter;
    if (principal.staffRole !== "platform_admin") {
      const assigned = await selectRows<{ tenant_id: string }>(
        tx,
        sql`select tenant_id from app.my_staff_assignments()`,
      );
      if (assigned.length === 0) return [];
      filter = inArray(tenants.id, assigned.map((a) => a.tenant_id));
    }
    return tx
      .select({ id: tenants.id, name: tenants.name, slug: tenants.slug, status: tenants.status, plan: tenants.plan, createdAt: tenants.createdAt })
      .from(tenants)
      .where(filter)
      .orderBy(desc(tenants.createdAt));
  });
  return c.json(ok(items));
});

consoleRoutes.get(`${base}/:tenantId`, requireAssignedTenant("tenants:read"), async (c) => {
  const tenantId = c.get("access").tenantId;
  const overview = await run(c, assignedTenantContext(c), async (tx) => {
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) throw new NotFoundError("Customer not found");
    const spaces = await tx.select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug }).from(workspaces);
    const [lead] = await tx
      .select({ id: leads.id, companyName: leads.companyName, email: leads.email, intent: leads.intent })
      .from(leads)
      .where(eq(leads.convertedTenantId, tenantId));
    const [discovery] = lead
      ? await tx.select().from(opportunities).where(eq(opportunities.leadId, lead.id))
      : [];
    const onboarding = await Promise.all(
      spaces.map(async (ws) => ({ workspaceId: ws.id, ...(await loadOnboarding(tx, ws.id)) })),
    );
    const conns = await tx
      .select({
        id: connections.id,
        workspaceId: connections.workspaceId,
        connector: connectors.slug,
        displayName: connections.displayName,
        status: connections.status,
        lastHealthyAt: connections.lastHealthyAt,
      })
      .from(connections)
      .innerJoin(connectors, eq(connectors.id, connections.connectorId))
      .where(isNull(connections.deletedAt));
    const invites = await tx
      .select({ id: invitations.id, email: invitations.email, role: invitations.role, status: invitations.status, expiresAt: invitations.expiresAt })
      .from(invitations)
      .orderBy(desc(invitations.createdAt));
    return {
      tenant,
      workspaces: spaces,
      lead: lead ?? null,
      discovery: discovery ?? null,
      onboarding,
      connections: conns,
      invitations: invites,
    };
  });
  return c.json(ok(overview));
});

const auditQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

consoleRoutes.get(`${base}/:tenantId/audit`, requireAssignedTenant("audit:read"), async (c) => {
  const query = auditQuery.safeParse(c.req.query());
  if (!query.success) throw new ValidationError("Invalid query", query.error.flatten());
  const { page, limit } = query.data;
  const tenantId = c.get("access").tenantId;
  const { items, total } = await run(c, assignedTenantContext(c), async (tx) => {
    const where = eq(auditEvents.tenantId, tenantId);
    const items = await tx
      .select({
        id: auditEvents.id,
        eventType: auditEvents.eventType,
        actorId: auditEvents.actorId,
        actorRole: auditEvents.actorRole,
        resourceType: auditEvents.resourceType,
        resourceId: auditEvents.resourceId,
        payload: auditEvents.payload,
        createdAt: auditEvents.createdAt,
      })
      .from(auditEvents)
      .where(where)
      .orderBy(desc(auditEvents.id))
      .limit(limit)
      .offset((page - 1) * limit);
    const [counted] = await tx.select({ total: count() }).from(auditEvents).where(where);
    return { items, total: counted?.total ?? 0 };
  });
  return c.json(ok(items, { total, page, limit }));
});

consoleRoutes.post(
  `${base}/:tenantId/invitations/:invitationId/resend`,
  requireAssignedTenant("users:invite"),
  async (c) => {
    const invitationId = parseUuidParam(c, "invitationId");
    const access = c.get("access");
    const { invite, tenantName } = await run(c, assignedTenantContext(c), async (tx) => {
      const [tenant] = await tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, access.tenantId));
      const invite = await rotateInvitation(tx, invitationId);
      await recordAudit(tx, {
        eventType: "invitation.resent",
        tenantId: access.tenantId,
        actorId: c.get("principal").userId,
        actorRole: access.role,
        resourceType: "invitation",
        resourceId: invitationId,
        requestId: c.get("requestId"),
      });
      return { invite, tenantName: tenant?.name ?? "your workspace" };
    });
    const config = c.get("config");
    const delivery = await sendInvitationEmail(
      () => c.get("deps").emailSender(config, c.env),
      config.appOrigin,
      invite,
      tenantName,
    );
    return c.json(ok({ invitationId, expiresAt: invite.expiresAt.toISOString(), emailDelivery: delivery }));
  },
);

consoleRoutes.post(
  `${base}/:tenantId/invitations/:invitationId/revoke`,
  requireAssignedTenant("users:invite"),
  async (c) => {
    const invitationId = parseUuidParam(c, "invitationId");
    const access = c.get("access");
    await run(c, assignedTenantContext(c), async (tx) => {
      await revokeInvitation(tx, invitationId);
      await recordAudit(tx, {
        eventType: "invitation.revoked",
        tenantId: access.tenantId,
        actorId: c.get("principal").userId,
        actorRole: access.role,
        resourceType: "invitation",
        resourceId: invitationId,
        requestId: c.get("requestId"),
      });
    });
    return c.json(ok({ invitationId, revoked: true }));
  },
);