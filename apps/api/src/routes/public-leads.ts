import { Hono } from "hono";
import { z } from "zod";
import { ValidationError, ok } from "@marketing-os/core";
import type { HonoEnv } from "../app";
import { memoryStore, type LeadRecord } from "../store/memory";

const leadSchema = z.object({
  companyName: z.string().min(1).max(200),
  contactName: z.string().min(1).max(200),
  email: z.string().email().max(320),
  jobTitle: z.string().max(200).optional(),
  country: z.string().max(100).optional(),
  industry: z.string().max(100).optional(),
  majorProblem: z.string().max(5000).optional(),
  objectives: z.string().max(5000).optional(),
  notes: z.string().max(5000).optional(),
  intent: z
    .enum(["expert_services", "cloud_workspace", "enterprise", "enterprise_licence"])
    .default("expert_services"),
  honeypot: z.string().max(0).optional(),
  website: z.string().max(0).optional(),
  turnstileToken: z.string().optional(),
});

export const publicLeadsRoutes = new Hono<HonoEnv>();

publicLeadsRoutes.post("/api/v1/public/leads", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Invalid lead payload", parsed.error.flatten());
  }
  if (parsed.data.honeypot || parsed.data.website) {
    throw new ValidationError("Rejected");
  }

  const existing = [...memoryStore.leads.values()].find(
    (lead) =>
      lead.email.toLowerCase() === parsed.data.email.toLowerCase() &&
      Date.now() - new Date(lead.createdAt).getTime() < 24 * 60 * 60 * 1000,
  );
  if (existing) {
    return c.json(ok(existing), 200);
  }

  const lead: LeadRecord = {
    id: crypto.randomUUID(),
    companyName: parsed.data.companyName,
    contactName: parsed.data.contactName,
    email: parsed.data.email,
    intent: parsed.data.intent,
    status: "new",
    createdAt: new Date().toISOString(),
  };
  if (parsed.data.jobTitle) lead.jobTitle = parsed.data.jobTitle;
  if (parsed.data.country) lead.country = parsed.data.country;
  if (parsed.data.industry) lead.industry = parsed.data.industry;
  if (parsed.data.majorProblem) lead.majorProblem = parsed.data.majorProblem;
  const objectives = parsed.data.objectives ?? parsed.data.notes;
  if (objectives) lead.objectives = objectives;

  memoryStore.leads.set(lead.id, lead);
  memoryStore.recordAudit("lead.created", { leadId: lead.id });
  return c.json(ok(lead), 201);
});
