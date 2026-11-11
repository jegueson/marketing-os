import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const openapiPath = join(root, "packages/openapi/openapi.json");
const generatedPath = join(root, "packages/api-client/src/generated/schema.ts");

describe("OpenAPI client generation", () => {
  it("exports the live API paths in openapi.json", () => {
    const doc = JSON.parse(readFileSync(openapiPath, "utf8")) as {
      paths: Record<string, unknown>;
    };
    expect(doc.paths["/healthz"]).toBeDefined();
    expect(doc.paths["/readyz"]).toBeDefined();
    expect(doc.paths["/api/v1/public/leads"]).toBeDefined();
    expect(doc.paths["/api/v1/me"]).toBeDefined();
    expect(doc.paths["/api/v1/leads"]).toBeDefined();
    expect(doc.paths["/api/v1/workspaces/{workspaceId}/cockpit"]).toBeDefined();
    expect(doc.paths["/api/v1/workspaces/{workspaceId}/integrations"]).toBeDefined();
    expect(doc.paths["/api/v1/workspaces/{workspaceId}/connections"]).toBeDefined();
    expect(doc.paths["/api/v1/workspaces/{workspaceId}/onboarding"]).toBeDefined();
    expect(doc.paths["/api/v1/invitations/accept"]).toBeDefined();
    expect(doc.paths["/api/v1/console/customers"]).toBeDefined();
  });

  it("keeps a generated TypeScript schema checked in", () => {
    const source = readFileSync(generatedPath, "utf8");
    expect(source).toMatch(/\/healthz/);
    expect(source).toMatch(/operations/);
  });
});
