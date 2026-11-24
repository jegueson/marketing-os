import { describe, expect, it } from "vitest";
import { isEnabled, knownFlags, platformFlagDefault } from "./flags";

describe("feature flags", () => {
  it("defaults unknown flags to false", () => {
    expect(isEnabled("cockpit.brand")).toBe(false);
  });

  it("prefers tenant override over platform default", () => {
    expect(
      isEnabled("cockpit.brand", {
        platformDefaults: { "cockpit.brand": false },
        tenantOverrides: { "cockpit.brand": true },
      }),
    ).toBe(true);
  });

  it("keeps ask_marketing off by default", () => {
    expect(knownFlags).toContain("ask_marketing");
    expect(platformFlagDefault("ask_marketing")).toBe(false);
    expect(isEnabled("ask_marketing")).toBe(false);
  });

  it("keeps specialist_config off by default", () => {
    expect(knownFlags).toContain("specialist_config");
    expect(platformFlagDefault("specialist_config")).toBe(false);
    expect(platformFlagDefault("not_a_real_flag")).toBe(false);
    expect(isEnabled("specialist_config")).toBe(false);
  });
});
