import { describe, expect, it, vi } from "vitest";
import { deployPlan, runDeploy } from "./deploy";

describe("mos deploy", () => {
  it("migrates before deploying the API, then the web app", () => {
    expect(deployPlan("/repo").map((s) => s.label)).toEqual([
      "Check Cloudflare login",
      "Apply database migrations",
      "Deploy API Worker",
      "Deploy web Worker",
    ]);
  });

  it("only prints commands in dry-run mode", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => runDeploy(deployPlan("/repo"), true)).not.toThrow();
    expect(log).toHaveBeenCalledTimes(4);
    log.mockRestore();
  });

  it("stops on the first failing step", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => runDeploy([{ label: "Fail", cwd: "/", command: "false", args: [] }], false)).toThrow(
      /Fail failed with exit code 1/,
    );
  });
});
