import { z } from "zod";

export const leadIntents = ["expert_services", "cloud_workspace", "enterprise_licence"] as const;

const optionalText = (max: number) => z.string().trim().max(max).optional();

/** Shared by the public API route and the `/get-started` form. */
export const publicLeadCreateSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  contactName: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(320),
  intent: z.enum(leadIntents).default("expert_services"),
  jobTitle: optionalText(200),
  country: optionalText(100),
  industry: optionalText(100),
  majorProblem: optionalText(5000),
  objectives: optionalText(5000),
  notes: optionalText(5000),
  utmSource: optionalText(200),
  utmMedium: optionalText(200),
  utmCampaign: optionalText(200),
  referrer: optionalText(2000),
  /** Honeypot fields. Real users leave them empty. */
  website: z.string().max(0).optional(),
  honeypot: z.string().max(0).optional(),
  turnstileToken: z.string().max(4096).optional(),
});

export const leadStatusSchema = z.enum([
  "new",
  "contacted",
  "discovery",
  "qualified",
  "converted",
  "disqualified",
  "archived",
]);

export const leadStatusUpdateSchema = z.object({ status: leadStatusSchema });

export const leadNoteCreateSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
  noteType: z.enum(["general", "discovery", "call"]).default("general"),
});

export const opportunityUpsertSchema = z.object({
  title: z.string().trim().min(1).max(200),
  businessProblems: optionalText(10_000),
  stackMap: z.record(z.string().max(500)).optional(),
  pilotObjectives: optionalText(10_000),
  desiredOutcomes: optionalText(10_000),
  recommendedIntegrations: z.array(z.string().max(100)).max(50).optional(),
});

export type PublicLeadCreate = z.infer<typeof publicLeadCreateSchema>;
export type LeadStatusUpdate = z.infer<typeof leadStatusUpdateSchema>;
export type LeadNoteCreate = z.infer<typeof leadNoteCreateSchema>;
export type OpportunityUpsert = z.infer<typeof opportunityUpsertSchema>;
