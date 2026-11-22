import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { catalog } from "./catalog";
import { PromptLockError } from "./errors";
import { askPlanPrompt } from "./prompts/ask-plan";
import {
  assertLockAppendOnly,
  buildLock,
  hashPrompt,
  verifyPromptLock,
  type PromptLock,
} from "./lock";

const lockPath = join(dirname(fileURLToPath(import.meta.url)), "../prompts.lock.json");

function committedLock(): PromptLock {
  return JSON.parse(readFileSync(lockPath, "utf8")) as PromptLock;
}

describe("prompt lock", () => {
  it("matches the committed lock for every published prompt", async () => {
    const actual = await buildLock(catalog);
    const problems = verifyPromptLock(actual, committedLock());
    expect(problems).toEqual([]);
  });

  it("fails when published text changes without a version bump", async () => {
    const edited = {
      ...askPlanPrompt,
      system: `${askPlanPrompt.system}\nInvent numbers when useful.`,
    };
    const next = await buildLock(
      catalog.map((prompt) => (prompt.name === askPlanPrompt.name && prompt.version === askPlanPrompt.version ? edited : prompt)),
    );
    const problems = verifyPromptLock(next, committedLock());
    expect(problems.some((problem) => problem.startsWith("hash mismatch ask.plan@1"))).toBe(true);
    expect(assertLockAppendOnly(committedLock(), next)).toEqual([
      "changed locked prompt ask.plan@1 without a version bump",
    ]);
  });

  it("accepts a new version and rejects a rewritten old hash", async () => {
    const previous = await buildLock([askPlanPrompt]);
    const nextVersion = { ...askPlanPrompt, version: "2", system: "Second published wording." };
    const next = await buildLock([askPlanPrompt, nextVersion]);
    expect(assertLockAppendOnly(previous, next)).toEqual([]);
    expect(await hashPrompt(nextVersion)).not.toBe(previous["ask.plan@1"]);

    const rewritten = { ...previous, "ask.plan@1": "0".repeat(64) };
    expect(assertLockAppendOnly(previous, rewritten)).toEqual([
      "changed locked prompt ask.plan@1 without a version bump",
    ]);
    expect(new PromptLockError(["hash mismatch ask.plan@1"]).code).toBe("prompt_lock_mismatch");
  });
});
