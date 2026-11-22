import type { z } from "zod";
import { PromptBindingError, PromptNotFoundError } from "./errors";
import { fenceRecord } from "./fence";
import type { PromptDefinition, PromptSource } from "./types";

export type RenderedPrompt = {
  prompt: PromptDefinition;
  system: string;
  user: string;
};

export function createPromptSource(prompts: readonly PromptDefinition[]): PromptSource {
  const byId = new Map<string, PromptDefinition>();
  for (const prompt of prompts) {
    const id = `${prompt.name}@${prompt.version}`;
    if (byId.has(id)) {
      throw new Error(`Duplicate prompt ${id}`);
    }
    byId.set(id, prompt);
  }
  return {
    get(name, version) {
      return byId.get(`${name}@${version}`) ?? null;
    },
    list() {
      return [...byId.values()];
    },
  };
}

function asData(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** Parse bindings, then fence every field. The system text is not modified. */
export function renderBindings(bindings: z.ZodType, raw: unknown): string {
  const parsed = bindings.safeParse(raw);
  if (!parsed.success) {
    throw new PromptBindingError(parsed.error.issues);
  }
  const data = parsed.data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return fenceRecord({ input: asData(data) });
  }
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    record[key] = asData(value);
  }
  return fenceRecord(record);
}

export class PromptRegistry {
  constructor(private readonly source: PromptSource) {}

  get(name: string, version: string): PromptDefinition {
    const prompt = this.source.get(name, version);
    if (!prompt) throw new PromptNotFoundError(name, version);
    return prompt;
  }

  render(name: string, version: string, raw: unknown): RenderedPrompt {
    const prompt = this.get(name, version);
    return {
      prompt,
      system: prompt.system,
      user: renderBindings(prompt.bindings, raw),
    };
  }
}
