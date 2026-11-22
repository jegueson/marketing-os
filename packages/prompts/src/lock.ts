import type { PromptDefinition } from "./types";

export type PromptLock = Record<string, string>;

export function promptId(prompt: Pick<PromptDefinition, "name" | "version">): string {
  return `${prompt.name}@${prompt.version}`;
}

function schemaFingerprint(schema: unknown, depth = 0): unknown {
  if (depth > 8 || schema === null || typeof schema !== "object") return null;
  const def = (schema as { def?: { type?: unknown; options?: unknown[] } }).def;
  const type = typeof def?.type === "string" ? def.type : "unknown";
  const fingerprint: Record<string, unknown> = { type };
  const shape = (schema as { shape?: Record<string, unknown> }).shape;
  if (shape && typeof shape === "object") {
    const fields: Record<string, unknown> = {};
    for (const key of Object.keys(shape).sort()) {
      fields[key] = schemaFingerprint(shape[key], depth + 1);
    }
    fingerprint.fields = fields;
  }
  if (Array.isArray(def?.options)) {
    fingerprint.options = def.options.map((option) => schemaFingerprint(option, depth + 1));
  }
  return fingerprint;
}

/** Stable document for the lock. Text, bindings, output schema, and model limits. */
export function canonicalPrompt(prompt: PromptDefinition): string {
  return JSON.stringify({
    name: prompt.name,
    version: prompt.version,
    purpose: prompt.purpose,
    system: prompt.system,
    model: prompt.model,
    bindings: schemaFingerprint(prompt.bindings),
    output: schemaFingerprint(prompt.output),
  });
}

export async function hashPrompt(prompt: PromptDefinition): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalPrompt(prompt)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildLock(prompts: readonly PromptDefinition[]): Promise<PromptLock> {
  const lock: PromptLock = {};
  for (const prompt of prompts) {
    lock[promptId(prompt)] = await hashPrompt(prompt);
  }
  return lock;
}

/** Published text must match the committed hash for that name@version. */
export function verifyPromptLock(actual: PromptLock, committed: PromptLock): string[] {
  const problems: string[] = [];
  const keys = [...new Set([...Object.keys(actual), ...Object.keys(committed)])].sort();
  for (const key of keys) {
    if (!(key in committed)) problems.push(`missing lock entry ${key}`);
    else if (!(key in actual)) problems.push(`lock entry ${key} has no prompt`);
    else if (actual[key] !== committed[key]) problems.push(`hash mismatch ${key}`);
  }
  return problems;
}

/** An existing version's hash is immutable. Publish a new version instead. */
export function assertLockAppendOnly(previous: PromptLock, next: PromptLock): string[] {
  const problems: string[] = [];
  for (const [key, hash] of Object.entries(previous)) {
    if (!(key in next)) problems.push(`removed locked prompt ${key}`);
    else if (next[key] !== hash) problems.push(`changed locked prompt ${key} without a version bump`);
  }
  return problems;
}
