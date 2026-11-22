import { askAnswerPrompt } from "./prompts/ask-answer";
import { askPlanPrompt } from "./prompts/ask-plan";
import type { PromptDefinition } from "./types";

/** Prompts published in this repository. A new version is a new entry. */
export const catalog: readonly PromptDefinition[] = [askPlanPrompt, askAnswerPrompt];
