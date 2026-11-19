import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { catalog } from "../src/catalog";
import { buildLock, verifyPromptLock, type PromptLock } from "../src/lock";

const root = dirname(fileURLToPath(import.meta.url));
const lockPath = join(root, "../prompts.lock.json");
const committed = JSON.parse(readFileSync(lockPath, "utf8")) as PromptLock;
const actual = await buildLock(catalog);
const problems = verifyPromptLock(actual, committed);
if (problems.length > 0) {
  console.error("Prompt lock check failed. Bump the prompt version and update prompts.lock.json.");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
