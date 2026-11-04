import { z } from "zod";

export const publicLeadCreateSchema = z.object({
  companyName: z.string().min(1).max(200),
  contactName: z.string().min(1).max(200),
  email: z.string().email().max(320),
  intent: z.enum([
    "expert_services",
    "cloud_workspace",
    "enterprise",
    "enterprise_licence",
  ]),
  notes: z.string().max(5000).optional(),
  website: z.string().max(0).optional(),
  honeypot: z.string().max(0).optional(),
  turnstileToken: z.string().optional(),
});

export const leadStatusSchema = z.enum([
  "new",
  "contacted",
  "discovery",
  "qualified",
  "converted",
  "disqualified",
]);

export type PublicLeadCreate = z.infer<typeof publicLeadCreateSchema>;
