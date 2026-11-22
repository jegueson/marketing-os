import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  decryptSecret,
  importMasterKey,
  openKeyRing,
} from "@marketing-os/core";
import { eq } from "drizzle-orm";
import {
  modelCredentials,
  saveTenantModelCredential,
  withContext,
  type Database,
  type ModelProvider,
} from "@marketing-os/db";
import { SetupError, type SetupConfigFile } from "./setup";

export type ModelsMigrateResult = {
  configPath: string;
  migrated: boolean;
  fingerprint: string | null;
  tenantId: string | null;
};

/**
 * Moves a legacy `.mos/setup.json` modelApiKey blob into `model_credentials`
 * and rewrites the file without ciphertext. Safe to run when already migrated.
 */
export async function runModelsMigrate(
  cwd: string,
  deps: { db: Database; dataKey: string },
): Promise<ModelsMigrateResult> {
  const configPath = path.join(cwd, ".mos", "setup.json");
  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new SetupError("No .mos/setup.json found. Run mos setup first, or nothing to migrate.");
    }
    throw err;
  }

  let config: SetupConfigFile;
  try {
    config = JSON.parse(raw) as SetupConfigFile;
  } catch {
    throw new SetupError(".mos/setup.json is not valid JSON");
  }

  if (!config.tenantId || !config.modelProvider) {
    throw new SetupError(".mos/setup.json is missing tenantId or modelProvider");
  }

  if (!config.modelApiKey) {
    return {
      configPath,
      migrated: false,
      fingerprint: config.modelKeyFingerprint ?? null,
      tenantId: config.tenantId,
    };
  }

  const blob = config.modelApiKey;
  if (!blob.ciphertext || !blob.iv || !blob.keyVersion) {
    throw new SetupError(".mos/setup.json modelApiKey blob is incomplete");
  }

  const keyBytes = Buffer.from(deps.dataKey, "base64");
  if (keyBytes.length !== 32) {
    throw new SetupError("MOS_DATA_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32)");
  }

  let plaintext: string;
  try {
    const key = await importMasterKey(new Uint8Array(keyBytes));
    plaintext = await decryptSecret(
      { ciphertext: blob.ciphertext, iv: blob.iv, keyVersion: blob.keyVersion },
      key,
    );
  } catch {
    throw new SetupError("Could not decrypt the legacy model key with MOS_DATA_KEY");
  }

  // The env key is the material that sealed the legacy blob. Re-seal with the
  // same version so we do not invent a second key the API does not have.
  const ring = await openKeyRing(blob.keyVersion, [
    { version: blob.keyVersion, base64: deps.dataKey },
  ]);

  const provider = config.modelProvider as ModelProvider;
  const { fingerprint, wrote } = await withContext(
    deps.db,
    { tenantId: config.tenantId, userId: null, staff: true },
    async (tx) => {
      const [existing] = await tx
        .select({ fingerprint: modelCredentials.fingerprint })
        .from(modelCredentials)
        .where(eq(modelCredentials.tenantId, config.tenantId));
      // Do not overwrite a key already saved via the settings API.
      if (existing) {
        return { fingerprint: existing.fingerprint, wrote: false };
      }
      const saved = await saveTenantModelCredential(tx, {
        tenantId: config.tenantId,
        provider,
        apiKey: plaintext,
        ring,
      });
      return { fingerprint: saved.fingerprint, wrote: true };
    },
  );

  const next: SetupConfigFile = {
    deploymentMode: config.deploymentMode,
    tenantId: config.tenantId,
    workspaceId: config.workspaceId,
    modelProvider: config.modelProvider,
    modelKeyFingerprint: fingerprint,
    starterSkillsSeeded: config.starterSkillsSeeded ?? false,
  };
  await writeFile(configPath, JSON.stringify(next, null, 2));
  await chmod(configPath, 0o600);

  return {
    configPath,
    migrated: wrote,
    fingerprint,
    tenantId: config.tenantId,
  };
}
