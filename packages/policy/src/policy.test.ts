import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { roles, type Role } from "@marketing-os/core";
import { decideApproval, decideWrite, policyDefinitionSchema } from "./policy";

const allowedRoles: Role[] = ["customer_admin", "ai_specialist"];

const linearIssue = {
  name: "linear-create-issue",
  version: "1.0.0",
  connector: "linear",
  action: "create_issue",
  riskClass: "medium" as const,
  requireApproval: true as const,
  allowedRoles,
  expiresInHours: 72,
};

describe("policyDefinitionSchema", () => {
  it("rejects a write that does not require approval", () => {
    const parsed = policyDefinitionSchema.safeParse({ ...linearIssue, requireApproval: false });
    expect(parsed.success).toBe(false);
  });

  it("rejects a role name that is not in the core role list", () => {
    const parsed = policyDefinitionSchema.safeParse({
      ...linearIssue,
      allowedRoles: ["ai_marketing_specialist"],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an expiry outside 1 to 168 hours", () => {
    expect(policyDefinitionSchema.safeParse({ ...linearIssue, expiresInHours: 0 }).success).toBe(false);
    expect(policyDefinitionSchema.safeParse({ ...linearIssue, expiresInHours: 169 }).success).toBe(false);
  });

  it("accepts the core roles and no others", () => {
    const parsed = policyDefinitionSchema.parse({
      ...linearIssue,
      allowedRoles: [...roles],
    });
    expect(parsed.allowedRoles).toEqual([...roles]);
  });
});

describe("decideWrite", () => {
  it("denies when no policy matches and does not mutate the list", () => {
    const policies = [linearIssue];
    const before = structuredClone(policies);
    const decision = decideWrite({
      policies,
      connector: "linear",
      action: "create_comment",
      autonomy: "approval_required",
    });
    expect(decision).toEqual({ decision: "deny", reason: "no_policy" });
    expect(policies).toEqual(before);
  });

  it("denies when two policies name the same action", () => {
    const decision = decideWrite({
      policies: [linearIssue, { ...linearIssue, name: "linear-create-issue-copy" }],
      connector: "linear",
      action: "create_issue",
      autonomy: "approval_required",
    });
    expect(decision).toEqual({ decision: "deny", reason: "ambiguous_policy" });
  });

  it("denies observe, recommend, and controlled autonomy", () => {
    for (const autonomy of ["observe", "recommend", "controlled_autonomy"] as const) {
      const decision = decideWrite({
        policies: [linearIssue],
        connector: "linear",
        action: "create_issue",
        autonomy,
      });
      const reason = autonomy === "controlled_autonomy" ? "unattended_denied" : "autonomy_cannot_write";
      expect(decision).toEqual({ decision: "deny", reason });
    }
  });

  it("requires approval for a single matching policy", () => {
    const decision = decideWrite({
      policies: [linearIssue],
      connector: "linear",
      action: "create_issue",
      autonomy: "approval_required",
    });
    expect(decision).toEqual({
      decision: "require_approval",
      expiresInHours: 72,
      riskClass: "medium",
      allowedRoles: ["customer_admin", "ai_specialist"],
    });
  });
});

describe("decideApproval", () => {
  it("denies a role that the policy does not list", () => {
    const parsed = policyDefinitionSchema.parse(linearIssue);
    expect(decideApproval({ policy: parsed, role: "customer_user" })).toEqual({
      decision: "deny",
      reason: "role_denied",
    });
  });

  it("permits a listed role to decide", () => {
    const parsed = policyDefinitionSchema.parse(linearIssue);
    expect(decideApproval({ policy: parsed, role: "customer_admin" })).toEqual({ decision: "permit" });
  });
});

describe("package boundary", () => {
  it("does not import the database or a connector", () => {
    const dir = join(import.meta.dirname);
    const files = readdirSync(dir).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));
    const source = files.map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
    const imports = source
      .split("\n")
      .filter((line) => line.includes("from ") || line.includes("import("))
      .join("\n");
    expect(imports).not.toMatch(/drizzle|@marketing-os\/db|@marketing-os\/connector|node:fetch/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });
});
