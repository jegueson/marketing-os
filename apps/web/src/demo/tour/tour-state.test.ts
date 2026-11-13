import { describe, expect, it } from "vitest";
import { initialTourState, tourReducer } from "./tour-state";

const total = 3;

describe("tourReducer", () => {
  it("starts at the first step", () => {
    const state = tourReducer(initialTourState, { type: "start", total });
    expect(state).toEqual({ active: true, index: 0, total });
  });

  it("moves forward and back inside the bounds", () => {
    let state = tourReducer(initialTourState, { type: "start", total });
    state = tourReducer(state, { type: "next" });
    expect(state.index).toBe(1);
    state = tourReducer(state, { type: "prev" });
    state = tourReducer(state, { type: "prev" });
    expect(state.index).toBe(0);
  });

  it("ends the tour after the last step", () => {
    let state = tourReducer(initialTourState, { type: "start", total });
    state = tourReducer(state, { type: "next" });
    state = tourReducer(state, { type: "next" });
    state = tourReducer(state, { type: "next" });
    expect(state.active).toBe(false);
  });

  it("jumps to a valid step and ignores invalid ones", () => {
    const started = tourReducer(initialTourState, { type: "start", total });
    expect(tourReducer(started, { type: "goto", index: 2 }).index).toBe(2);
    expect(tourReducer(started, { type: "goto", index: 9 })).toBe(started);
  });

  it("exits on demand", () => {
    const started = tourReducer(initialTourState, { type: "start", total });
    expect(tourReducer(started, { type: "exit" }).active).toBe(false);
  });

  it("does not mutate the previous state", () => {
    const started = tourReducer(initialTourState, { type: "start", total });
    const snapshot = { ...started };
    tourReducer(started, { type: "next" });
    expect(started).toEqual(snapshot);
  });
});
