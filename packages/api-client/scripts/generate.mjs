#!/usr/bin/env node
/**
 * 1) Export OpenAPI from the API Worker route registry (via Vitest so YAML imports work).
 * 2) Generate TypeScript types into src/generated/schema.ts.
 *
 * Usage: pnpm --filter @marketing-os/api-client generate
 * Or from root: pnpm openapi:generate
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const openapiPath = join(root, "packages/openapi/openapi.json");
const outPath = join(root, "packages/api-client/src/generated/schema.ts");

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("Exporting OpenAPI document from apps/api…");
run("pnpm", ["exec", "vitest", "run", "apps/api/src/openapi.export.test.ts"]);

mkdirSync(dirname(outPath), { recursive: true });
console.log("Generating TypeScript types…");
run("pnpm", ["exec", "openapi-typescript", openapiPath, "-o", outPath]);

console.log(`Generated ${outPath}`);
