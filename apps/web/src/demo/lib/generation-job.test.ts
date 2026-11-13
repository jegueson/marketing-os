import { describe, expect, it } from "vitest";
import { advanceGenerationJob, INITIAL_GENERATION_JOB } from "./generation-job";

describe("advanceGenerationJob", () => {
  it("starts from idle into queued", () => {
    expect(advanceGenerationJob(INITIAL_GENERATION_JOB)).toEqual({
      phase: "queued",
      progress: 15,
      variantCount: 0,
      error: null,
    });
  });

  it("walks queued → running → brand_check → ready with four variants", () => {
    let state = INITIAL_GENERATION_JOB;
    state = advanceGenerationJob(state);
    expect(state.phase).toBe("queued");
    state = advanceGenerationJob(state);
    expect(state).toMatchObject({ phase: "running", progress: 55 });
    state = advanceGenerationJob(state);
    expect(state).toMatchObject({ phase: "brand_check", progress: 85 });
    state = advanceGenerationJob(state);
    expect(state).toEqual({ phase: "ready", progress: 100, variantCount: 4, error: null });
  });

  it("is a no-op once ready", () => {
    let state = INITIAL_GENERATION_JOB;
    for (let i = 0; i < 4; i++) state = advanceGenerationJob(state);
    expect(advanceGenerationJob(state)).toBe(state);
  });

  it("does not mutate the previous state object", () => {
    const first = advanceGenerationJob(INITIAL_GENERATION_JOB);
    expect(first).not.toBe(INITIAL_GENERATION_JOB);
    expect(INITIAL_GENERATION_JOB.phase).toBe("idle");
  });
});
