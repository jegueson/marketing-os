import { z } from "zod";
import { PromptLockError } from "./errors";
import { createPromptSource } from "./registry";
import type { ModelConstraints, PromptDefinition, PromptSource } from "./types";

/**
 * Tenant prompts are plain text plus model limits.
 * Bindings stay a single `context` string so the DB does not store a second schema language.
 */
const tenantBindings = z.object({ context: z.string().max(20_000) }).strict();
const tenantOutput = z.object({ text: z.string() }).strict();

/** Name must match `tenant/<slug>`. Platform names such as `ask.plan` fail closed. */
const tenantPromptName = z
  .string()
  .trim()
  .regex(/^tenant\/[a-z][a-z0-9]*(-[a-z0-9]+)*$/);

export type TenantPromptRecord = {
  name: string;
  version: string;
  purpose: string;
  system: string;
  contentHash: string;
  model: ModelConstraints;
};

export type TenantPromptBody = Omit<TenantPromptRecord, "contentHash">;

/** Stable document for the content hash. Bindings stay out; they are fixed in code. */
export function canonicalTenantPrompt(prompt: TenantPromptBody): string {
  return JSON.stringify({
    name: prompt.name,
    version: prompt.version,
    purpose: prompt.purpose,
    system: prompt.system,
    model: {
      structuredOutput: prompt.model.structuredOutput,
      temperatureMax: prompt.model.temperatureMax,
      minContextWindow: prompt.model.minContextWindow,
    },
  });
}

export async function hashTenantPrompt(prompt: TenantPromptBody): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalTenantPrompt(prompt)),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toDefinition(record: TenantPromptRecord): PromptDefinition {
  return {
    name: record.name,
    version: record.version,
    purpose: record.purpose,
    system: record.system,
    bindings: tenantBindings,
    output: tenantOutput,
    model: record.model,
  };
}

/**
 * Builds a source from database rows. Validates each name and content hash before
 * the source is returned. A bad row fails the whole load.
 */
export async function createTenantPromptSource(
  records: readonly TenantPromptRecord[],
): Promise<PromptSource> {
  const prompts: PromptDefinition[] = [];
  const problems: string[] = [];
  for (const record of records) {
    const named = tenantPromptName.safeParse(record.name);
    if (!named.success) {
      problems.push(`invalid tenant prompt name ${record.name}`);
      continue;
    }
    const expected = await hashTenantPrompt({
      name: record.name,
      version: record.version,
      purpose: record.purpose,
      system: record.system,
      model: record.model,
    });
    if (expected !== record.contentHash) {
      problems.push(`hash mismatch ${record.name}@${record.version}`);
      continue;
    }
    prompts.push(toDefinition(record));
  }
  if (problems.length > 0) {
    throw new PromptLockError(problems);
  }
  return createPromptSource(prompts);
}

/** Primary wins. Use the code catalog first so a tenant row cannot shadow `ask.plan`. */
export function chainPromptSources(primary: PromptSource, fallback: PromptSource): PromptSource {
  return {
    get(name, version) {
      return primary.get(name, version) ?? fallback.get(name, version);
    },
    list() {
      const seen = new Set<string>();
      const out: PromptDefinition[] = [];
      for (const prompt of [...primary.list(), ...fallback.list()]) {
        const id = `${prompt.name}@${prompt.version}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(prompt);
      }
      return out;
    },
  };
}
