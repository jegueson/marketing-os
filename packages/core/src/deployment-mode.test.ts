import { describe, expect, it } from "vitest";
import { deploymentModes, isDeploymentMode } from "./deployment-mode";

describe("deployment mode", () => {
  it("accepts the two supported modes", () => {
    expect(deploymentModes).toEqual(["self_hosted", "cloud"]);
    expect(isDeploymentMode("self_hosted")).toBe(true);
    expect(isDeploymentMode("cloud")).toBe(true);
  });

  it("rejects unknown modes", () => {
    expect(isDeploymentMode("saas")).toBe(false);
  });
});
