import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "@hono/zod-openapi";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  canTransitionLead,
  ok,
} from "@marketing-os/core";
import {
  leadNoteCreateSchema,
  leadStatusSchema,
  leadStatusUpdateSchema,
  opportunityUpsertSchema,
} from "@marketing-os/schemas";
import {
  auditEvents,
  leadBriefs,
  leadSources,
  leads,
  opportunities,
  successManagerNotes,
  type Database,
} from "@marketing-os/db";
import { requirePrincipal, requireStaff } from "../auth/principal";
import { run, staffContext, type AppContext, type StaffRole } from "../context";
import { recordAudit } from "../lib/events";
import { parseBody, parseUuidParam } from "../lib/http";
import {
  apiSuccessSchema,
  createRouter,
  defineRoute,
  errorResponses,
  jsonBody,
  jsonContent,
  jsonValueSchema,
  uuidPathParam,
} from "../lib/openapi";
import { provisionFromLead } from "../services/provisioning";
import { sendInvitationEmail } from "../services/invitations";

export const leadsRoutes = createRouter();

leadsRoutes.use("/api/v1/leads", requirePrincipal);
leadsRoutes.use("/api/v1/leads/*", requirePrincipal);

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: leadStatusSchema.optional(),
  q: z.string().trim().max(200).optional(),
});

const idParams = z.object({ id: uuidPathParam("id") });
const leadSecurity = [{ Bearer: [] }];

const listLeadsRoute = defineRoute({
  method: "get",
  path: "/api/v1/leads",
  tags: ["Leads"],
  security: leadSecurity,
  middleware: [requireStaff("leads:read")],
  request: { query: listQuery },
  responses: {
    200: jsonContent(apiSuccessSchema(z.array(jsonValueSchema), "LeadListResponse"), "Paginated leads"),
    ...errorResponses(401, 403, 422),
  },
});

const getLeadRoute = defineRoute({
  method: "get",
  path: "/api/v1/leads/{id}",
  tags: ["Leads"],
  security: leadSecurity,
  middleware: [requireStaff("leads:read")],
  request: { params: idParams },
  responses: {
    200: jsonContent(apiSuccessSchema(jsonValueSchema, "LeadDetailResponse"), "Lead with briefs, sources, notes"),
    ...errorResponses(401, 403, 404, 422),
  },
});

const updateLeadStatusRoute = defineRoute({
  method: "patch",
  path: "/api/v1/leads/{id}/status",
  tags: ["Leads"],
  security: leadSecurity,
  middleware: [requireStaff("leads:write")],
  request: { params: idParams, body: jsonBody(leadStatusUpdateSchema as never) },
  responses: {
    200: jsonContent(apiSuccessSchema(jsonValueSchema, "LeadStatusResponse"), "Updated lead"),
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

const addLeadNoteRoute = defineRoute({
  method: "post",
  path: "/api/v1/leads/{id}/notes",
  tags: ["Leads"],
  security: leadSecurity,
  middleware: [requireStaff("leads:write")],
  request: { params: idParams, body: jsonBody(leadNoteCreateSchema as never) },
  responses: {
    201: jsonContent(apiSuccessSchema(jsonValueSchema, "LeadNoteResponse"), "Note created"),
    ...errorResponses(401, 403, 404, 422),
  },
});

const upsertOpportunityRoute = defineRoute({
  method: "put",
  path: "/api/v1/leads/{id}/opportunity",
  tags: ["Leads"],
  security: leadSecurity,
  middleware: [requireStaff("leads:write")],
  request: { params: idParams, body: jsonBody(opportunityUpsertSchema as never) },
  responses: {
    200: jsonContent(apiSuccessSchema(jsonValueSchema, "LeadOpportunityResponse"), "Saved opportunity"),
    ...errorResponses(401, 403, 404, 422),
  },
});

const convertLeadRoute = defineRoute({
  method: "post",
  path: "/api/v1/leads/{id}/convert",
  tags: ["Leads"],
  security: leadSecurity,
  middleware: [requireStaff("tenants:provision")],
  request: { params: idParams },
  responses: {
    201: jsonContent(apiSuccessSchema(jsonValueSchema, "LeadConvertResponse"), "Tenant provisioned"),
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

const parseLeadId = (c: AppContext) => parseUuidParam(c, "id");

function actorOf(c: AppContext) {
  const principal = c.get("principal");
  return {
    userId: principal.userId,
    staffRole: principal.staffRole as StaffRole,
    requestId: c.get("requestId"),
  };
}

async function loadLead(tx: Database, id: string) {
  const [lead] = await tx.select().from(leads).where(eq(leads.id, id));
  if (!lead) throw new NotFoundError("Lead not found");
  return lead;
}

leadsRoutes.openapi(listLeadsRoute, async (c) => {
  const query = listQuery.safeParse(c.req.query());
  if (!query.success) throw new ValidationError("Invalid query", query.error.flatten());
  const { page, limit, status, q } = query.data;
  const filters: SQL[] = [];
  if (status) filters.push(eq(leads.status, status));
  if (q) {
    const pattern = `%${q.replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`;
    const match = or(ilike(leads.companyName, pattern), ilike(leads.email, pattern), ilike(leads.contactName, pattern));
    if (match) filters.push(match);
  }
  const where = filters.length ? and(...filters) : undefined;

  const { items, total } = await run(c, staffContext(c.get("principal")), async (tx) => {
    const items = await tx
      .select({
        id: leads.id,
        companyName: leads.companyName,
        contactName: leads.contactName,
        email: leads.email,
        intent: leads.intent,
        status: leads.status,
        createdAt: leads.createdAt,
        convertedTenantId: leads.convertedTenantId,
      })
      .from(leads)
      .where(where)
      .orderBy(desc(leads.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);
    const [counted] = await tx.select({ total: count() }).from(leads).where(where);
    return { items, total: counted?.total ?? 0 };
  });
  return c.json(ok(items, { total, page, limit }), 200);
});

leadsRoutes.openapi(getLeadRoute, async (c) => {
  const id = parseLeadId(c);
  const detail = await run(c, staffContext(c.get("principal")), async (tx) => {
    const lead = await loadLead(tx, id);
    const [briefs, sources, notes, [opportunity], history] = await Promise.all([
      tx.select().from(leadBriefs).where(eq(leadBriefs.leadId, id)),
      tx.select().from(leadSources).where(eq(leadSources.leadId, id)),
      tx.select().from(successManagerNotes).where(eq(successManagerNotes.leadId, id)).orderBy(asc(successManagerNotes.createdAt)),
      tx.select().from(opportunities).where(eq(opportunities.leadId, id)),
      tx
        .select({ at: auditEvents.createdAt, actorId: auditEvents.actorId, payload: auditEvents.payload })
        .from(auditEvents)
        .where(and(eq(auditEvents.resourceType, "lead"), eq(auditEvents.resourceId, id), eq(auditEvents.eventType, "lead.status_changed")))
        .orderBy(asc(auditEvents.id)),
    ]);
    return { lead, briefs, sources, notes, opportunity: opportunity ?? null, statusHistory: history };
  });
  return c.json(ok(detail), 200);
});

leadsRoutes.openapi(updateLeadStatusRoute, async (c) => {
  const id = parseLeadId(c);
  const { status: next } = await parseBody(c, leadStatusUpdateSchema);
  if (next === "converted") {
    throw new ConflictError("Use the convert action to convert a lead");
  }
  const actor = actorOf(c);
  const lead = await run(c, staffContext(c.get("principal")), async (tx) => {
    const current = await loadLead(tx, id);
    if (!canTransitionLead(leadStatusSchema.parse(current.status), next)) {
      throw new ConflictError(`Cannot move a lead from ${current.status} to ${next}`);
    }
    const [updated] = await tx
      .update(leads)
      .set({ status: next, updatedAt: sql`now()` })
      .where(and(eq(leads.id, id), eq(leads.status, current.status)))
      .returning();
    if (!updated) throw new ConflictError("Lead changed while updating. Reload and retry.");
    await recordAudit(tx, {
      eventType: "lead.status_changed",
      actorId: actor.userId,
      actorRole: actor.staffRole,
      resourceType: "lead",
      resourceId: id,
      payload: { from: current.status, to: next },
      requestId: actor.requestId,
    });
    return updated;
  });
  return c.json(ok(lead), 200);
});

leadsRoutes.openapi(addLeadNoteRoute, async (c) => {
  const id = parseLeadId(c);
  const input = await parseBody(c, leadNoteCreateSchema);
  const actor = actorOf(c);
  const note = await run(c, staffContext(c.get("principal")), async (tx) => {
    const lead = await loadLead(tx, id);
    const [created] = await tx
      .insert(successManagerNotes)
      .values({ leadId: id, tenantId: lead.convertedTenantId, authorId: actor.userId, body: input.body, noteType: input.noteType })
      .returning();
    await recordAudit(tx, {
      eventType: "lead.note_added",
      actorId: actor.userId,
      actorRole: actor.staffRole,
      resourceType: "lead",
      resourceId: id,
      requestId: actor.requestId,
    });
    return created;
  });
  return c.json(ok(note), 201);
});

leadsRoutes.openapi(upsertOpportunityRoute, async (c) => {
  const id = parseLeadId(c);
  const input = await parseBody(c, opportunityUpsertSchema);
  const actor = actorOf(c);
  const values = {
    title: input.title,
    businessProblems: input.businessProblems ?? null,
    stackMap: input.stackMap ?? null,
    pilotObjectives: input.pilotObjectives ?? null,
    desiredOutcomes: input.desiredOutcomes ?? null,
    recommendedIntegrations: input.recommendedIntegrations ?? [],
  };
  const opportunity = await run(c, staffContext(c.get("principal")), async (tx) => {
    await loadLead(tx, id);
    const [existing] = await tx.select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.leadId, id));
    const [saved] = existing
      ? await tx.update(opportunities).set({ ...values, updatedAt: sql`now()` }).where(eq(opportunities.id, existing.id)).returning()
      : await tx.insert(opportunities).values({ ...values, leadId: id, ownerId: actor.userId }).returning();
    await recordAudit(tx, {
      eventType: "lead.discovery_recorded",
      actorId: actor.userId,
      actorRole: actor.staffRole,
      resourceType: "lead",
      resourceId: id,
      requestId: actor.requestId,
    });
    return saved;
  });
  return c.json(ok(opportunity), 200);
});

leadsRoutes.openapi(convertLeadRoute, async (c) => {
  const id = parseLeadId(c);
  const deps = c.get("deps");
  const result = await run(c, staffContext(c.get("principal")), (tx) =>
    provisionFromLead(tx, id, actorOf(c), deps.provisioningHooks),
  );
  const config = c.get("config");
  const inviteEmail = await sendInvitationEmail(
    () => deps.emailSender(config, c.env),
    config.appOrigin,
    result.invitation,
    result.tenant.name,
  );
  return c.json(
    ok({
      tenant: result.tenant,
      workspace: result.workspace,
      invitation: {
        id: result.invitation.id,
        email: result.invitation.email,
        expiresAt: result.invitation.expiresAt.toISOString(),
        emailDelivery: inviteEmail,
      },
    }),
    201,
  );
});
