/**
 * Writes packages/openapi/openapi.json from the live OpenAPIHono route registry.
 * Run via: pnpm --filter @marketing-os/api export-openapi
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app";
import { openApiDocumentConfig } from "../src/lib/openapi";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const outPath = join(root, "packages/openapi/openapi.json");

const app = createApp();
const doc = app.getOpenAPI31Document(openApiDocumentConfig);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`Wrote ${outPath} (${Object.keys(doc.paths ?? {}).length} paths)`);
