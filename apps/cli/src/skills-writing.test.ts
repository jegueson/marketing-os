import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { skillDefinitionSchema } from "@marketing-os/schemas";
import { parse as parseYaml } from "yaml";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const guidePath = join(repoRoot, "skills/WRITING.md");

/** Pull the first fenced yaml block from the writing guide. */
function extractFirstYamlExample(markdown: string): string {
  const match = markdown.match(/```ya?ml\n([\s\S]*?)```/);
  if (!match?.[1]) {
    throw new Error(`${guidePath} must contain a fenced yaml example`);
  }
  return match[1].trim();
}

describe("skills writing guide", () => {
  it("includes an example that validates against skillDefinitionSchema", () => {
    const markdown = readFileSync(guidePath, "utf8");
    expect(markdown.toLowerCase()).toContain("without a deploy");
    const example = extractFirstYamlExample(markdown);
    const parsed = skillDefinitionSchema.safeParse(parseYaml(example));
    expect(parsed.success, JSON.stringify(parsed.error?.issues ?? [])).toBe(true);
  });
});
