import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { isDeploymentMode, openKeyRing } from "@marketing-os/core";
import {
  saveTenantModelCredential,
  withContext,
  type Database,
  type ModelProvider,
} from "@marketing-os/db";
import type { AuthAdmin } from "./auth-admin";
import { seedPlatformMetrics } from "./metrics-seed";
import { provisionInstall } from "./install";
import { seedStarterSkills } from "./skills-seed";

const DATA_KEY_VERSION = 1;

const setupInputSchema = z.object({
  deploymentMode: z.string(),
  adminEmail: z.string().trim().toLowerCase().email(),
  adminPassword: z.string().min(12, "Admin password must be at least 12 characters"),
  tenantName: z.string().trim().min(2).max(200),
  tenantSlug: z.string().regex(/^[a-z0-9-]+$/, "Slug may use lowercase letters, digits and dashes"),
  modelProvider: z.enum(["openrouter", "openai_compatible", "openai", "anthropic"]).default("openrouter"),
  modelApiKey: z.string().min(16),
  modelBaseUrl: z.string().url().nullable().optional(),
  force: z.boolean().default(false),
});

export type SetupInput = z.input<typeof setupInputSchema>;

export type SetupDeps = {
  db: Database;
  auth: AuthAdmin;
  /** Base64 of 32 random bytes; the same value goes into the API's MOS_DATA_KEY. */
  dataKey: string;
};

export type SetupResult = {
  configPath: string;
  adminEmail: string;
  tenantId: string;
  workspaceId: string;
  tenantSlug: string;
  deploymentMode: string;
  modelProvider: string;
  /** Never the raw key: a short fingerprint only. */
  modelKeyFingerprint: string;
  created: boolean;
};

export class SetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupError";
  }
}

function assertDataKey(encoded: string): string {
  const raw = Buffer.from(encoded, "base64");
  if (raw.length !== 32) {
    throw new SetupError("MOS_DATA_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32)");
  }
  return encoded;
}

/** Non-secret install metadata. The model API key lives in Postgres only (ADR-0025). */
export type SetupConfigFile = {
  deploymentMode: string;
  tenantId: string;
  workspaceId: string;
  modelProvider: string;
  modelKeyFingerprint: string;
  starterSkillsSeeded: boolean;
  /** Present only on legacy installs before `mos models migrate`. */
  modelApiKey?: { ciphertext: string; iv: string; keyVersion: number };
};

/**
 * First-run wizard. Creates the platform admin in Supabase Auth, the tenant,
 * workspace and membership in Postgres, and seals the model key into
 * `model_credentials`. `.mos/setup.json` keeps fingerprint and ids only.
 */
export async function runSetup(cwd: string, raw: SetupInput, deps: SetupDeps): Promise<SetupResult> {
  const input = setupInputSchema.parse(raw);
  if (!isDeploymentMode(input.deploymentMode)) {
    throw new SetupError(`Invalid deployment mode: ${input.deploymentMode}`);
  }
  if (input.modelApiKey.toLowerCase().includes("password")) {
    throw new SetupError("Refusing weak model API key");
  }
  const dataKey = assertDataKey(deps.dataKey);
  const ring = await openKeyRing(DATA_KEY_VERSION, [{ version: DATA_KEY_VERSION, base64: dataKey }]);

  const admin = await deps.auth.ensureUser(input.adminEmail, input.adminPassword);
  await deps.auth.setStaffRole(admin.id, "platform_admin");
  const install = await provisionInstall(deps.db, {
    adminUserId: admin.id,
    adminEmail: input.adminEmail,
    tenantName: input.tenantName,
    tenantSlug: input.tenantSlug,
  });
  await seedPlatformMetrics(
    deps.db,
    fileURLToPath(new URL("../../../customer-configs/_templates/metrics.yaml", import.meta.url)),
  );

  const { fingerprint } = await withContext(
    deps.db,
    { tenantId: install.tenantId, userId: admin.id, staff: true },
    (tx) =>
      saveTenantModelCredential(tx, {
        tenantId: install.tenantId,
        provider: input.modelProvider as ModelProvider,
        apiKey: input.modelApiKey,
        baseUrl: input.modelBaseUrl ?? null,
        ring,
      }),
  );

  const dir = path.join(cwd, ".mos");
  const configPath = path.join(dir, "setup.json");
  await mkdir(dir, { recursive: true });
  let starterSkillsSeeded = false;
  try {
    const previous = JSON.parse(await readFile(configPath, "utf8")) as Partial<SetupConfigFile>;
    if (typeof previous.starterSkillsSeeded === "boolean") {
      starterSkillsSeeded = previous.starterSkillsSeeded;
    }
  } catch {
    // First run: no prior file.
  }
  if (!starterSkillsSeeded) {
    const starterDir = fileURLToPath(new URL("../../../skills/starter", import.meta.url));
    const seeded = await seedStarterSkills(deps.db, {
      tenantId: install.tenantId,
      workspaceId: install.workspaceId,
      publishedBy: admin.id,
      starterDir,
    });
    // True once the library is present — including a re-run that only skips.
    starterSkillsSeeded = seeded.imported.length > 0 || seeded.skipped.length > 0;
  }
  const config: SetupConfigFile = {
    deploymentMode: input.deploymentMode,
    tenantId: install.tenantId,
    workspaceId: install.workspaceId,
    modelProvider: input.modelProvider,
    modelKeyFingerprint: fingerprint,
    starterSkillsSeeded,
  };
  await writeFile(configPath, JSON.stringify(config, null, 2));
  await chmod(configPath, 0o600);

  return {
    configPath,
    adminEmail: input.adminEmail,
    tenantId: install.tenantId,
    workspaceId: install.workspaceId,
    tenantSlug: input.tenantSlug,
    deploymentMode: input.deploymentMode,
    modelProvider: input.modelProvider,
    modelKeyFingerprint: fingerprint,
    created: install.created || admin.created,
  };
}
