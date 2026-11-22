import type { z } from "zod";

export type StructuredOutputConstraint = "json_schema" | "json_object" | "none";

/** Limits the registry records for a prompt. The gateway still enforces them at call time. */
export type ModelConstraints = {
  structuredOutput: StructuredOutputConstraint;
  temperatureMax: number;
  minContextWindow: number;
};

export type PromptDefinition<TIn extends z.ZodType = z.ZodType, TOut extends z.ZodType = z.ZodType> = {
  name: string;
  version: string;
  purpose: string;
  system: string;
  bindings: TIn;
  output: TOut;
  model: ModelConstraints;
};

/** Sprint 4 can replace this with a database-backed source. Callers keep using PromptRegistry. */
export interface PromptSource {
  get(name: string, version: string): PromptDefinition | null;
  list(): readonly PromptDefinition[];
}
