import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseConfigYaml } from "@marketing-os/config";
import {
  findSkillByName,
  importConfigYaml,
  withContext,
  type Database,
} from "@marketing-os/db";

/** Catalog entries required to publish the starter weekly-review skill. */
const STARTER_TOOL_CATALOG = [{ connector: "mock", tool: "list_campaigns" }] as const;

export type SeedStarterSkillsInput = {
  tenantId: string;
  workspaceId: string;
  publishedBy: string;
  /** Absolute path to `skills/starter`. */
  starterDir: string;
};

export type SeedStarterSkillsResult = {
  /** Skill names newly imported on this call. */
  imported: string[];
  /** Skill names already present and skipped. */
  skipped: string[];
};

async function listSkillYamlFiles(starterDir: string): Promise<string[]> {
  const entries = await readdir(starterDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(starterDir, entry.name, "skill.yaml");
    try {
      await readFile(candidate);
      files.push(candidate);
    } catch {
      // Directory without skill.yaml — skip.
    }
  }
  return files.sort();
}

/**
 * Imports valid starter skills into the setup tenant workspace.
 * Skips YAML that does not match skillDefinitionSchema (legacy stubs).
 * Idempotent: existing published names are not re-imported.
 */
export async function seedStarterSkills(
  db: Database,
  input: SeedStarterSkillsInput,
): Promise<SeedStarterSkillsResult> {
  const files = await listSkillYamlFiles(input.starterDir);
  const imported: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    let name: string;
    try {
      const parsed = parseConfigYaml("skill", source);
      if (parsed.kind !== "skill") continue;
      name = parsed.document.name;
    } catch {
      // Not a Sprint 4 skill definition — leave it on disk for later.
      continue;
    }

    const existing = await withContext(
      db,
      { tenantId: input.tenantId, userId: input.publishedBy, staff: true },
      (tx) =>
        findSkillByName(tx, {
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          name,
        }),
    );
    if (existing) {
      skipped.push(name);
      continue;
    }

    await withContext(
      db,
      { tenantId: input.tenantId, userId: input.publishedBy, staff: true },
      (tx) =>
        importConfigYaml(tx, {
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          publishedBy: input.publishedBy,
          kind: "skill",
          source,
          catalog: STARTER_TOOL_CATALOG,
        }),
    );
    imported.push(name);
  }

  return { imported, skipped };
}
