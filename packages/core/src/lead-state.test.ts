import { describe, expect, it } from "vitest";
import { assertLeadTransition, canTransitionLead, leadStatuses } from "./lead-state";

describe("lead state machine", () => {
  it("allows the happy path to converted", () => {
    expect(canTransitionLead("new", "contacted")).toBe(true);
    expect(canTransitionLead("contacted", "discovery")).toBe(true);
    expect(canTransitionLead("discovery", "qualified")).toBe(true);
    expect(canTransitionLead("qualified", "converted")).toBe(true);
  });

  it("blocks illegal transitions", () => {
    expect(canTransitionLead("new", "converted")).toBe(false);
    expect(canTransitionLead("converted", "qualified")).toBe(false);
    expect(() => assertLeadTransition("new", "converted")).toThrow(/Illegal/);
  });

  it("lists terminal and non-terminal statuses", () => {
    expect(leadStatuses).toContain("disqualified");
  });
});
