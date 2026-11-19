import { catalog } from "./catalog";
import { createPromptSource, PromptRegistry } from "./registry";

export { PromptBindingError, PromptLockError, PromptNotFoundError } from "./errors";
export { fenceData } from "./fence";
export { assertLockAppendOnly, buildLock, hashPrompt, verifyPromptLock, type PromptLock } from "./lock";
export { catalog } from "./catalog";
export { askAnswerPrompt } from "./prompts/ask-answer";
export { askPlanPrompt } from "./prompts/ask-plan";
export { createPromptSource, PromptRegistry, type RenderedPrompt } from "./registry";
export type { ModelConstraints, PromptDefinition, PromptSource } from "./types";

/** Registry over the prompts shipped in this package. */
export function codePromptRegistry(): PromptRegistry {
  return new PromptRegistry(createPromptSource(catalog));
}
