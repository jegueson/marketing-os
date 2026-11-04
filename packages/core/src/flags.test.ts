import { describe, expect, it } from "vitest";
import { isEnabled } from "./flags";

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
});
