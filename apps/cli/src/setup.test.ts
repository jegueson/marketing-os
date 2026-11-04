import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runSetup } from "./setup";

describe("mos setup", () => {
  it("creates config without printing the raw key", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "mos-setup-"));
    const result = await runSetup(cwd, {
      deploymentMode: "self_hosted",
      adminEmail: "admin@example.com",
      tenantName: "Local",
      tenantSlug: "local",
      modelProvider: "openrouter",
      modelApiKey: "sk-or-v1-testkey-123456",
      force: false,
    });
    expect(result.created).toBe(true);
    expect(JSON.stringify(result)).not.toContain("sk-or-v1-testkey");
    const onDisk = await readFile(result.configPath, "utf8");
    expect(onDisk).not.toContain("sk-or-v1-testkey-123456");
    expect(onDisk).toContain("modelApiKeyCiphertext");
  });

  it("is idempotent without force", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "mos-setup-"));
    const input = {
      deploymentMode: "self_hosted" as const,
      adminEmail: "admin@example.com",
      tenantName: "Local",
      tenantSlug: "local",
      modelProvider: "openrouter" as const,
      modelApiKey: "sk-or-v1-testkey-123456",
      force: false,
    };
    await runSetup(cwd, input);
    const second = await runSetup(cwd, input);
    expect(second.created).toBe(false);
  });

  it("refuses weak keys", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "mos-setup-"));
    await expect(
      runSetup(cwd, {
        deploymentMode: "self_hosted",
        adminEmail: "admin@example.com",
        tenantName: "Local",
        tenantSlug: "local",
        modelProvider: "openrouter",
        modelApiKey: "passwordpassword1",
        force: false,
      }),
    ).rejects.toThrow(/weak/i);
  });
});
