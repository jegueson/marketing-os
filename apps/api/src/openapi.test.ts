import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openApiDocumentConfig } from "./lib/openapi";

describe("OpenAPI document", () => {
  it("is generated from the registered zod-openapi routes", () => {
    const app = createApp();
    const doc = app.getOpenAPI31Document(openApiDocumentConfig);
    expect(doc.openapi).toMatch(/^3\.1/);
    expect(doc.info.title).toBe("Marketing OS API");
    expect(doc.paths?.["/healthz"]?.get).toBeDefined();
    expect(doc.paths?.["/api/v1/public/leads"]?.post).toBeDefined();
    expect(doc.paths?.["/api/v1/me"]?.get).toBeDefined();
    expect(doc.components?.schemas?.ApiFailure).toBeDefined();
  });
});
