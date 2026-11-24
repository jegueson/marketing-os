import { catalog } from "./catalog";
import { createPromptSource, PromptRegistry } from "./registry";
import {
  chainPromptSources,
  createTenantPromptSource,
  type TenantPromptRecord,
} from "./tenant-source";

export { PromptBindingError, PromptLockError, PromptNotFoundError } from "./errors";
export { fenceData, fenceRecord } from "./fence";
export { assertLockAppendOnly, buildLock, hashPrompt, verifyPromptLock, type PromptLock } from "./lock";
export { catalog } from "./catalog";
export { askAnswerPrompt } from "./prompts/ask-answer";
export { askPlanPrompt } from "./prompts/ask-plan";
export { createPromptSource, PromptRegistry, type RenderedPrompt } from "./registry";
export {
  canonicalTenantPrompt,
  chainPromptSources,
  createTenantPromptSource,
  hashTenantPrompt,
  type TenantPromptBody,
  type TenantPromptRecord,
} from "./tenant-source";
export type { ModelConstraints, PromptDefinition, PromptSource } from "./types";

/** Registry over the prompts shipped in this package. */
export function codePromptRegistry(): PromptRegistry {
  return new PromptRegistry(createPromptSource(catalog));
}

/** Code catalog first, then tenant prompts from the database. */
export async function tenantAwarePromptRegistry(
  records: readonly TenantPromptRecord[],
): Promise<PromptRegistry> {
  return new PromptRegistry(
    chainPromptSources(createPromptSource(catalog), await createTenantPromptSource(records)),
  );
}
