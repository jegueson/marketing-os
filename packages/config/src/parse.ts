import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { ValidationError } from "@marketing-os/core";
import { policyDefinitionSchema, type PolicyDefinition } from "@marketing-os/policy";
import {
  brandProfileSchema,
  businessProfileSchema,
  skillDefinitionSchema,
  workflowDefinitionSchema,
  type BrandProfile,
  type BusinessProfile,
  type SkillDefinition,
  type WorkflowDefinition,
} from "@marketing-os/schemas";

export type ConfigKind = "skill" | "workflow" | "business_profile" | "brand_profile" | "policy";

export type ParsedConfigDocument =
  | { kind: "skill"; document: SkillDefinition }
  | { kind: "workflow"; document: WorkflowDefinition }
  | { kind: "business_profile"; document: BusinessProfile }
  | { kind: "brand_profile"; document: BrandProfile }
  | { kind: "policy"; document: PolicyDefinition };

function validationIssues(error: { issues: { path: PropertyKey[]; code: string; message: string }[] }) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    code: issue.code,
    message: issue.message,
  }));
}

/** Parse YAML text and validate with the specialist config schemas. Fail closed. */
export function parseConfigYaml(kind: ConfigKind, source: string): ParsedConfigDocument {
  let raw: unknown;
  try {
    raw = parseYaml(source);
  } catch (error) {
    throw new ValidationError("Config YAML is not valid", {
      issues: [
        {
          path: "(root)",
          code: "custom",
          message: error instanceof Error ? error.message : "YAML parse failed",
        },
      ],
    });
  }

  switch (kind) {
    case "skill": {
      const parsed = skillDefinitionSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ValidationError("Skill YAML is invalid", { issues: validationIssues(parsed.error) });
      }
      return { kind, document: parsed.data };
    }
    case "workflow": {
      const parsed = workflowDefinitionSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ValidationError("Workflow YAML is invalid", { issues: validationIssues(parsed.error) });
      }
      return { kind, document: parsed.data };
    }
    case "business_profile": {
      const parsed = businessProfileSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ValidationError("Business profile YAML is invalid", {
          issues: validationIssues(parsed.error),
        });
      }
      return { kind, document: parsed.data };
    }
    case "brand_profile": {
      const parsed = brandProfileSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ValidationError("Brand profile YAML is invalid", {
          issues: validationIssues(parsed.error),
        });
      }
      return { kind, document: parsed.data };
    }
    case "policy": {
      const parsed = policyDefinitionSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ValidationError("Policy YAML is invalid", { issues: validationIssues(parsed.error) });
      }
      return { kind, document: parsed.data };
    }
    default: {
      const _exhaustive: never = kind;
      throw new ValidationError(`Unsupported config kind: ${String(_exhaustive)}`, {
        issues: [{ path: "kind", code: "custom", message: "unsupported" }],
      });
    }
  }
}

/** Export active documents only. Draft columns are never written here. */
export function serializeConfigYaml(document: unknown): string {
  return stringifyYaml(document, { lineWidth: 100, sortMapEntries: true }).trimEnd() + "\n";
}
