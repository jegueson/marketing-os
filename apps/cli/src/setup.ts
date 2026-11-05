import { createHash } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { encryptSecret, importMasterKey, isDeploymentMode } from "@marketing-os/core";
import type { Database } from "@marketing-os/db";
import type { AuthAdmin } from "./auth-admin";
import { provisionInstall } from "./install";

const DATA_KEY_VERSION = 1;

const setupInputSchema = z.object({
  deploymentMode: z.string(),
  adminEmail: z.string().trim().toLowerCase().email(),
  adminPassword: z.string().min(12, "Admin password must be at least 12 characters"),
  tenantName: z.string().trim().min(2).max(200),
  tenantSlug: z.string().regex(/^[a-z0-9-]+$/, "Slug may use lowercase letters, digits and dashes"),
  modelProvider: z.enum(["openrouter", "openai_compatible", "openai", "anthropic"]).default("openrouter"),
  modelApiKey: z.string().min(16),
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

function fingerprint(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

async function loadDataKey(encoded: string): Promise<CryptoKey> {
  const raw = Buffer.from(encoded, "base64");
  if (raw.length !== 32) {
    throw new SetupError("MOS_DATA_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32)");
  }
  return importMasterKey(new Uint8Array(raw));
}

/**
 * First-run wizard. Creates the platform admin in Supabase Auth, the tenant,
 * workspace and membership in Postgres, and stores the model key encrypted
 * under MOS_DATA_KEY in `.mos/setup.json`. Safe to run again.
 */
export async function runSetup(cwd: string, raw: SetupInput, deps: SetupDeps): Promise<SetupResult> {
  const input = setupInputSchema.parse(raw);
  if (!isDeploymentMode(input.deploymentMode)) {
    throw new SetupError(`Invalid deployment mode: ${input.deploymentMode}`);
  }
  if (input.modelApiKey.toLowerCase().includes("password")) {
    throw new SetupError("Refusing weak model API key");
  }
  const dataKey = await loadDataKey(deps.dataKey);

  const admin = await deps.auth.ensureUser(input.adminEmail, input.adminPassword);
  await deps.auth.setStaffRole(admin.id, "platform_admin");
  const install = await provisionInstall(deps.db, {
    adminUserId: admin.id,
    adminEmail: input.adminEmail,
    tenantName: input.tenantName,
    tenantSlug: input.tenantSlug,
  });

  const dir = path.join(cwd, ".mos");
  const configPath = path.join(dir, "setup.json");
  await mkdir(dir, { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify(
      {
        deploymentMode: input.deploymentMode,
        tenantId: install.tenantId,
        workspaceId: install.workspaceId,
        modelProvider: input.modelProvider,
        modelKeyFingerprint: fingerprint(input.modelApiKey),
        modelApiKey: await encryptSecret(input.modelApiKey, dataKey, DATA_KEY_VERSION),
        starterSkillsSeeded: false,
      },
      null,
      2,
    ),
  );
  await chmod(configPath, 0o600);

  return {
    configPath,
    adminEmail: input.adminEmail,
    tenantId: install.tenantId,
    workspaceId: install.workspaceId,
    tenantSlug: input.tenantSlug,
    deploymentMode: input.deploymentMode,
    modelProvider: input.modelProvider,
    modelKeyFingerprint: fingerprint(input.modelApiKey),
    created: install.created || admin.created,
  };
}
