import { parse } from "yaml";
import { z } from "zod";
import defaultTemplateSource from "../../../../customer-configs/_templates/onboarding.yaml";

export const onboardingTemplateSchema = z.object({
  version: z.literal(1),
  checklist: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z][a-z0-9_]*$/),
        title: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
      }),
    )
    .min(1)
    .refine((items) => new Set(items.map((i) => i.key)).size === items.length, {
      message: "Checklist keys must be unique",
    }),
  skills: z.array(z.string()).default([]),
});

export type OnboardingTemplate = z.infer<typeof onboardingTemplateSchema>;

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateError";
  }
}

export function parseOnboardingTemplate(source: string): OnboardingTemplate {
  let raw: unknown;
  try {
    raw = parse(source);
  } catch (err) {
    throw new TemplateError(`Onboarding template is not valid YAML: ${(err as Error).message}`);
  }
  const result = onboardingTemplateSchema.safeParse(raw);
  if (!result.success) {
    throw new TemplateError(`Onboarding template is invalid: ${result.error.message}`);
  }
  return result.data;
}

let cached: OnboardingTemplate | null = null;

export function defaultOnboardingTemplate(): OnboardingTemplate {
  cached ??= parseOnboardingTemplate(defaultTemplateSource);
  return cached;
}
