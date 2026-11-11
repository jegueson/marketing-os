import { and, eq } from "drizzle-orm";
import { AppError, formatLogLine, fromStoredCredential, openKeyRing, toStoredCredential, type KeyRing } from "@marketing-os/core";
import { credentialReferences, type Database } from "@marketing-os/db";
import type { AppEnv } from "../env";

const BUNDLE = "secret_bundle";

export async function keyRingFromConfig(config: AppEnv): Promise<KeyRing | null> {
  if (!config.dataKey) return null;
  const materials = [
    { version: config.dataKeyVersion, base64: config.dataKey },
    ...Object.entries(config.previousDataKeys).map(([version, base64]) => ({
      version: Number(version),
      base64,
    })),
  ];
  return openKeyRing(config.dataKeyVersion, materials);
}

/** Encrypts the credential map. The plaintext never goes into the row or the logs. */
export async function saveConnectionCredentials(
  tx: Database,
  input: { connectionId: string; tenantId: string; credentials: Record<string, string>; ring: KeyRing },
): Promise<void> {
  const sealed = toStoredCredential(await input.ring.seal(JSON.stringify(input.credentials)));
  const [existing] = await tx
    .select({ id: credentialReferences.id })
    .from(credentialReferences)
    .where(and(eq(credentialReferences.connectionId, input.connectionId), eq(credentialReferences.credentialType, BUNDLE)));
  if (existing) {
    await tx
      .update(credentialReferences)
      .set({ ...sealed, updatedAt: new Date() })
      .where(eq(credentialReferences.id, existing.id));
    return;
  }
  await tx.insert(credentialReferences).values({
    connectionId: input.connectionId,
    tenantId: input.tenantId,
    credentialType: BUNDLE,
    ...sealed,
  });
}

/**
 * Decrypts the connection bundle. A blob sealed with an older key version is
 * rewritten with the active key in the same transaction.
 */
export async function loadConnectionCredentials(
  tx: Database,
  connectionId: string,
  ring: KeyRing | null,
): Promise<Record<string, string>> {
  const [row] = await tx
    .select({
      id: credentialReferences.id,
      ciphertext: credentialReferences.ciphertext,
      nonce: credentialReferences.nonce,
      keyVersion: credentialReferences.keyVersion,
    })
    .from(credentialReferences)
    .where(and(eq(credentialReferences.connectionId, connectionId), eq(credentialReferences.credentialType, BUNDLE)));
  if (!row) return {};
  if (!ring) {
    throw new AppError("credentials_unreadable", "Credential encryption is not configured", 503);
  }
  let opened: Awaited<ReturnType<KeyRing["open"]>>;
  try {
    opened = await ring.open(fromStoredCredential(row));
  } catch (err) {
    console.error(
      formatLogLine({
        level: "error",
        message: "credential decrypt failed",
        connectionId,
        error: err instanceof Error ? err.name : "Error",
      }),
    );
    throw new AppError("credentials_unreadable", "Stored credentials could not be decrypted", 503);
  }
  if (opened.rotated) {
    await tx
      .update(credentialReferences)
      .set({ ...toStoredCredential(opened.blob), updatedAt: new Date() })
      .where(eq(credentialReferences.id, row.id));
  }
  const parsed: unknown = JSON.parse(opened.plaintext);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AppError("credentials_unreadable", "Stored credentials could not be decrypted", 503);
  }
  const credentials: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string") credentials[key] = value;
  }
  return credentials;
}
