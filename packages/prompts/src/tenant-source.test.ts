import { describe, expect, it } from "vitest";
import { catalog } from "./catalog";
import { PromptLockError, PromptNotFoundError } from "./errors";
import { codePromptRegistry, createPromptSource, PromptRegistry } from "./index";
import {
  chainPromptSources,
  createTenantPromptSource,
  hashTenantPrompt,
  type TenantPromptRecord,
} from "./tenant-source";

const model = {
  structuredOutput: "none" as const,
  temperatureMax: 0.2,
  minContextWindow: 4_000,
};

async function record(
  overrides: Partial<TenantPromptRecord> & Pick<TenantPromptRecord, "name" | "system">,
): Promise<TenantPromptRecord> {
  const base = {
    name: overrides.name,
    version: overrides.version ?? "1.0.0",
    purpose: overrides.purpose ?? "reporting",
    system: overrides.system,
    model: overrides.model ?? model,
  };
  return {
    ...base,
    contentHash: overrides.contentHash ?? (await hashTenantPrompt(base)),
  };
}

describe("tenant prompt source", () => {
  it("rejects a shadow of a platform prompt name", async () => {
    await expect(
      createTenantPromptSource([
        await record({ name: "ask.plan", system: "Shadow the platform prompt." }),
      ]),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof PromptLockError && err.problems.some((problem) => problem.includes("ask.plan")),
    );
  });

  it("rejects a hash mismatch", async () => {
    const valid = await record({
      name: "tenant/weekly-review",
      system: "Summarize the week.",
    });
    await expect(
      createTenantPromptSource([{ ...valid, contentHash: "0".repeat(64) }]),
    ).rejects.toBeInstanceOf(PromptLockError);
  });

  it("resolves a tenant prompt through PromptRegistry and keeps ask.plan on code", async () => {
    const tenant = await record({
      name: "tenant/weekly-review",
      system: "Write the weekly performance review from the fenced context.",
    });
    const source = chainPromptSources(
      createPromptSource(catalog),
      await createTenantPromptSource([tenant]),
    );
    const registry = new PromptRegistry(source);

    expect(registry.get("ask.plan", "1").system).toBe(codePromptRegistry().get("ask.plan", "1").system);
    expect(registry.get("tenant/weekly-review", "1.0.0").system).toContain("weekly performance review");
    expect(() => registry.get("tenant/missing", "1.0.0")).toThrow(PromptNotFoundError);

    const rendered = registry.render("tenant/weekly-review", "1.0.0", { context: "Spend rose." });
    expect(rendered.system).toContain("weekly performance review");
    expect(rendered.user).toContain("Spend rose.");
  });
});
