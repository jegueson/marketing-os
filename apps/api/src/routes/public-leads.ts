import { z } from "@hono/zod-openapi";
import { and, desc, gt, sql } from "drizzle-orm";
import { AppError, ValidationError, ok } from "@marketing-os/core";
import { publicLeadCreateSchema, type PublicLeadCreate } from "@marketing-os/schemas";
import { leadBriefs, leadSources, leads, type Database } from "@marketing-os/db";
import { clientIp, run, systemContext } from "../context";
import { enqueueEvent, recordAudit } from "../lib/events";
import { apiSuccessSchema, createRouter, defineRoute, errorResponses, jsonBody, jsonContent } from "../lib/openapi";

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

export const publicLeadsRoutes = createRouter();

const leadIntakeSchema = apiSuccessSchema(
  z.object({ id: z.string().uuid(), status: z.string(), duplicate: z.boolean() }),
  "PublicLeadCreateResponse",
);

const createPublicLeadRoute = defineRoute({
  method: "post",
  path: "/api/v1/public/leads",
  tags: ["Leads"],
  request: { body: jsonBody(publicLeadCreateSchema as never) },
  responses: {
    201: jsonContent(leadIntakeSchema, "Lead created"),
    200: jsonContent(leadIntakeSchema, "Duplicate of a lead created in the last 24 hours"),
    ...errorResponses(400, 422, 429, 503),
  },
});

async function findRecentLead(tx: Database, email: string) {
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
  const [existing] = await tx
    .select({ id: leads.id, status: leads.status, createdAt: leads.createdAt })
    .from(leads)
    .where(and(sql`lower(${leads.email}) = ${email}`, gt(leads.createdAt, since)))
    .orderBy(desc(leads.createdAt))
    .limit(1);
  return existing ?? null;
}

async function createLead(tx: Database, input: PublicLeadCreate, requestId: string) {
  const [lead] = await tx
    .insert(leads)
    .values({
      companyName: input.companyName,
      contactName: input.contactName,
      email: input.email,
      intent: input.intent,
      jobTitle: input.jobTitle ?? null,
      country: input.country ?? null,
      industry: input.industry ?? null,
      majorProblem: input.majorProblem ?? null,
      objectives: input.objectives ?? null,
    })
    .returning({ id: leads.id, status: leads.status, createdAt: leads.createdAt });
  if (!lead) throw new Error("Lead insert returned no row");
  if (input.notes) {
    await tx.insert(leadBriefs).values({ leadId: lead.id, freeText: input.notes });
  }
  await tx.insert(leadSources).values({
    leadId: lead.id,
    sourceType: "lead_form",
    utmSource: input.utmSource ?? null,
    utmMedium: input.utmMedium ?? null,
    utmCampaign: input.utmCampaign ?? null,
    referrerUrl: input.referrer ?? null,
  });
  await enqueueEvent(tx, "lead.created", null, { leadId: lead.id, intent: input.intent });
  await recordAudit(tx, {
    eventType: "lead.created",
    resourceType: "lead",
    resourceId: lead.id,
    payload: { intent: input.intent },
    requestId,
  });
  return lead;
}

publicLeadsRoutes.openapi(createPublicLeadRoute, async (c) => {
  const deps = c.get("deps");
  const ip = clientIp(c);
  if (!(await deps.leadRateLimiter(c.env).allow(`public-leads:${ip ?? "unknown"}`))) {
    throw new AppError("rate_limited", "Too many submissions. Try again in a minute.", 429);
  }

  const body: unknown = await c.req.json().catch(() => null);
  const parsed = publicLeadCreateSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Invalid lead payload", parsed.error.flatten());
  }

  const captcha = await deps.captcha(c.get("config")).verify(parsed.data.turnstileToken, ip);
  if (captcha === "not_configured") {
    throw new AppError("captcha_not_configured", "Lead intake is temporarily unavailable", 503);
  }
  if (captcha === "failed") {
    throw new AppError("captcha_failed", "Captcha verification failed. Reload and try again.", 400);
  }

  const result = await run(c, systemContext, async (tx) => {
    const existing = await findRecentLead(tx, parsed.data.email);
    if (existing) return { lead: existing, duplicate: true };
    return { lead: await createLead(tx, parsed.data, c.get("requestId")), duplicate: false };
  });

  const payload = ok({ id: result.lead.id, status: result.lead.status, duplicate: result.duplicate });
  return result.duplicate ? c.json(payload, 200) : c.json(payload, 201);
});
