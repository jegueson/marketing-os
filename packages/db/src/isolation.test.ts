import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const TENANT_TABLES = [
  "workspaces",
  "tenant_memberships",
  "staff_assignments",
  "connections",
  "credential_references",
  "data_scopes",
  "onboarding_checklists",
  "onboarding_checklist_items",
  "invitations",
];

describe("rls isolation harness (static)", () => {
  it("ships RLS SQL that enables RLS for tenant tables", () => {
    const sqlDir = path.join(root, "drizzle");
    const files = readdirSync(sqlDir).filter((f) => f.endsWith(".sql"));
    const combined = files
      .map((f) => readFileSync(path.join(sqlDir, f), "utf8"))
      .join("\n");
    expect(combined).toContain("CREATE ROLE app_api");
    expect(combined).toContain("NOBYPASSRLS");
    expect(combined).toContain("ENABLE ROW LEVEL SECURITY");
    expect(combined).toContain("REVOKE ALL ON TABLE");
    for (const table of TENANT_TABLES) {
      expect(combined).toContain(`'${table}'`);
    }
  });

  it("uses transaction-local set_config helpers", () => {
    const helpers = readFileSync(path.join(root, "drizzle/0001_rls_helpers.sql"), "utf8");
    expect(helpers).toContain("app.current_tenant_id");
    expect(helpers).toContain("current_setting('app.tenant_id', true)");
  });
});
