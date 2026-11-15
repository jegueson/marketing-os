/** Simulated creative-studio generation job for the investor demo. */

export type GenerationPhase = "idle" | "queued" | "running" | "brand_check" | "ready" | "failed";

export type GenerationJobState = {
  phase: GenerationPhase;
  progress: number;
  variantCount: number;
  error: string | null;
};

export const INITIAL_GENERATION_JOB: GenerationJobState = {
  phase: "idle",
  progress: 0,
  variantCount: 0,
  error: null,
};

const PHASE_ORDER: readonly GenerationPhase[] = ["queued", "running", "brand_check", "ready"];

/**
 * Advances one step through the fake generation pipeline.
 * Progress jumps 0 → 15 → 55 → 85 → 100. Variants appear when ready.
 */
export function advanceGenerationJob(state: GenerationJobState): GenerationJobState {
  if (state.phase === "ready" || state.phase === "failed") return state;

  if (state.phase === "idle") {
    return { phase: "queued", progress: 15, variantCount: 0, error: null };
  }

  const index = PHASE_ORDER.indexOf(state.phase);
  if (index < 0 || index >= PHASE_ORDER.length - 1) {
    return { ...state, phase: "failed", error: "Unknown generation phase", progress: state.progress };
  }

  const next = PHASE_ORDER[index + 1]!;
  const progress = next === "running" ? 55 : next === "brand_check" ? 85 : 100;
  const variantCount = next === "ready" ? 4 : 0;
  return { phase: next, progress, variantCount, error: null };
}
