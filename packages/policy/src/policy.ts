import { roles, type Role } from "@marketing-os/core";
import { z } from "zod";

/**
 * Same slug rule as specialist config. A connector slug such as `linear` fits.
 * Duplicated here so this package does not import the OpenAPI schema package.
 */
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);

const actionNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);

const semverSchema = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);

export const policyAutonomySchema = z.enum([
  "observe",
  "recommend",
  "approval_required",
  "controlled_autonomy",
]);

export const policyDefinitionSchema = z
  .object({
    name: slugSchema,
    version: semverSchema,
    connector: slugSchema,
    action: actionNameSchema,
    riskClass: z.enum(["low", "medium", "high"]),
    requireApproval: z.literal(true),
    allowedRoles: z.array(z.enum(roles)).min(1).max(roles.length),
    expiresInHours: z.number().int().min(1).max(168),
  })
  .strict();

export type PolicyDefinition = z.infer<typeof policyDefinitionSchema>;
export type PolicyAutonomy = z.infer<typeof policyAutonomySchema>;
export type PolicyRiskClass = PolicyDefinition["riskClass"];

export type WriteDecision =
  | {
      decision: "deny";
      reason: "no_policy" | "ambiguous_policy" | "autonomy_cannot_write" | "unattended_denied";
    }
  | {
      decision: "require_approval";
      expiresInHours: number;
      riskClass: PolicyRiskClass;
      allowedRoles: readonly Role[];
    };

export type ApprovalDecision = { decision: "deny"; reason: "role_denied" } | { decision: "permit" };

export type DecideWriteInput = {
  policies: readonly PolicyDefinition[];
  connector: string;
  action: string;
  autonomy: PolicyAutonomy;
};

/**
 * Queue a write for a person, or refuse it.
 * Sprint 5 has no unattended allow. `controlled_autonomy` stays refused
 * until a later sprint has an evaluation, a rollback note, and a human policy
 * that still records a decision.
 */
export function decideWrite(input: DecideWriteInput): WriteDecision {
  if (input.autonomy === "controlled_autonomy") {
    return { decision: "deny", reason: "unattended_denied" };
  }
  if (input.autonomy !== "approval_required") {
    return { decision: "deny", reason: "autonomy_cannot_write" };
  }

  const matches = input.policies.filter(
    (policy) =>
      policy.requireApproval === true &&
      policy.connector === input.connector &&
      policy.action === input.action,
  );
  if (matches.length === 0) {
    return { decision: "deny", reason: "no_policy" };
  }
  if (matches.length > 1) {
    return { decision: "deny", reason: "ambiguous_policy" };
  }
  const match = matches[0];
  if (!match) {
    return { decision: "deny", reason: "no_policy" };
  }

  return {
    decision: "require_approval",
    expiresInHours: match.expiresInHours,
    riskClass: match.riskClass,
    allowedRoles: [...match.allowedRoles],
  };
}

export type DecideApprovalInput = {
  policy: PolicyDefinition;
  role: Role;
};

/** Permit a decision by a listed role. This does not execute the write. */
export function decideApproval(input: DecideApprovalInput): ApprovalDecision {
  if (!input.policy.allowedRoles.includes(input.role)) {
    return { decision: "deny", reason: "role_denied" };
  }
  return { decision: "permit" };
}
