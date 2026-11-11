import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openApiDocumentConfig } from "./lib/openapi";

/**
 * Side-effect test used by `pnpm openapi:generate` so YAML imports resolve
 * through the Vitest plugin (same as Wrangler Text bindings).
 */
describe("openapi export", () => {
  it("writes packages/openapi/openapi.json from the route registry", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
    const outPath = join(root, "packages/openapi/openapi.json");
    const doc = createApp().getOpenAPI31Document(openApiDocumentConfig);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
    expect(Object.keys(doc.paths ?? {}).length).toBeGreaterThan(10);
    expect(doc.paths?.["/healthz"]).toBeDefined();
  });
});
