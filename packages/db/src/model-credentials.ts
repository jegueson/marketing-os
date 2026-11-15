import { eq } from "drizzle-orm";
import {
  AppError,
  fingerprintSecret,
  fromStoredCredential,
  toStoredCredential,
  type KeyRing,
} from "@marketing-os/core";
import type { Database } from "./context";
import { modelCredentials, tenantModelConfig, type ModelProvider } from "./schema/models";

export type ModelConfigInput = {
  tenantId: string;
  provider: ModelProvider;
  apiKey: string;
  baseUrl?: string | null;
  defaultModel?: string | null;
  ring: KeyRing;
};

export type ResolvedModelCredential = {
  provider: ModelProvider;
  apiKey: string;
  baseUrl: string | null;
  defaultModel: string | null;
  fingerprint: string;
  source: "tenant" | "platform";
};

export type PlatformModelCredential = {
  provider: ModelProvider;
  apiKey: string;
  baseUrl?: string | null;
  defaultModel?: string | null;
};

export type TenantModelSettingsView = {
  provider: ModelProvider;
  baseUrl: string | null;
  defaultModel: string | null;
  fingerprint: string | null;
};

/** Non-secret view for GET settings. Never returns ciphertext. */
export async function loadTenantModelSettings(
  tx: Database,
  tenantId: string,
): Promise<TenantModelSettingsView | null> {
  const [row] = await tx
    .select({
      provider: tenantModelConfig.provider,
      baseUrl: tenantModelConfig.baseUrl,
      defaultModel: tenantModelConfig.defaultModel,
      fingerprint: modelCredentials.fingerprint,
    })
    .from(tenantModelConfig)
    .leftJoin(modelCredentials, eq(modelCredentials.configId, tenantModelConfig.id))
    .where(eq(tenantModelConfig.tenantId, tenantId));
  if (!row) return null;
  return {
    provider: row.provider as ModelProvider,
    baseUrl: row.baseUrl,
    defaultModel: row.defaultModel,
    fingerprint: row.fingerprint,
  };
}

function assertApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length < 8) {
    throw new AppError("invalid_request", "Model API key is required", 422);
  }
  return trimmed;
}

function assertBaseUrl(provider: ModelProvider, baseUrl: string | null | undefined): string | null {
  const trimmed = baseUrl?.trim() || null;
  if (provider === "openai_compatible") {
    if (!trimmed) {
      throw new AppError("invalid_request", "openai_compatible requires a base URL", 422);
    }
  }
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AppError("invalid_request", "Model base URL is invalid", 422);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new AppError("invalid_request", "Model base URL must be http(s)", 422);
  }
  return trimmed;
}

/** Upserts non-secret config and seals the API key into `model_credentials`. */
export async function saveTenantModelCredential(tx: Database, input: ModelConfigInput): Promise<{ fingerprint: string }> {
  const apiKey = assertApiKey(input.apiKey);
  const baseUrl = assertBaseUrl(input.provider, input.baseUrl);
  const fingerprint = await fingerprintSecret(apiKey);
  const sealed = toStoredCredential(await input.ring.seal(apiKey));

  const [upserted] = await tx
    .insert(tenantModelConfig)
    .values({
      tenantId: input.tenantId,
      provider: input.provider,
      baseUrl,
      defaultModel: input.defaultModel ?? null,
    })
    .onConflictDoUpdate({
      target: tenantModelConfig.tenantId,
      set: {
        provider: input.provider,
        baseUrl,
        defaultModel: input.defaultModel ?? null,
        updatedAt: new Date(),
      },
    })
    .returning({ id: tenantModelConfig.id });
  if (!upserted) throw new AppError("internal_error", "Failed to upsert tenant model config", 500);
  const configId = upserted.id;

  await tx
    .insert(modelCredentials)
    .values({
      tenantId: input.tenantId,
      configId,
      ...sealed,
      fingerprint,
    })
    .onConflictDoUpdate({
      target: modelCredentials.tenantId,
      set: {
        configId,
        ...sealed,
        fingerprint,
        updatedAt: new Date(),
      },
    });

  return { fingerprint };
}

/**
 * Tenant sealed key first; else optional cloud platform key; else `model_not_configured`.
 * A blob sealed with an older key version is rewritten with the active key.
 */
export async function resolveModelCredential(
  tx: Database,
  input: {
    tenantId: string;
    ring: KeyRing | null;
    platform?: PlatformModelCredential | null;
  },
): Promise<ResolvedModelCredential> {
  const [row] = await tx
    .select({
      id: modelCredentials.id,
      ciphertext: modelCredentials.ciphertext,
      nonce: modelCredentials.nonce,
      keyVersion: modelCredentials.keyVersion,
      fingerprint: modelCredentials.fingerprint,
      provider: tenantModelConfig.provider,
      baseUrl: tenantModelConfig.baseUrl,
      defaultModel: tenantModelConfig.defaultModel,
    })
    .from(modelCredentials)
    .innerJoin(tenantModelConfig, eq(modelCredentials.configId, tenantModelConfig.id))
    .where(eq(modelCredentials.tenantId, input.tenantId));

  if (row) {
    if (!input.ring) {
      throw new AppError("credentials_unreadable", "Credential encryption is not configured", 503);
    }
    let opened: Awaited<ReturnType<KeyRing["open"]>>;
    try {
      opened = await input.ring.open(fromStoredCredential(row));
    } catch {
      throw new AppError("credentials_unreadable", "Stored model credentials could not be decrypted", 503);
    }
    if (opened.rotated) {
      await tx
        .update(modelCredentials)
        .set({ ...toStoredCredential(opened.blob), updatedAt: new Date() })
        .where(eq(modelCredentials.id, row.id));
    }
    return {
      provider: row.provider as ModelProvider,
      apiKey: opened.plaintext,
      baseUrl: row.baseUrl,
      defaultModel: row.defaultModel,
      fingerprint: row.fingerprint,
      source: "tenant",
    };
  }

  if (input.platform?.apiKey) {
    return {
      provider: input.platform.provider,
      apiKey: input.platform.apiKey,
      baseUrl: input.platform.baseUrl ?? null,
      defaultModel: input.platform.defaultModel ?? null,
      fingerprint: await fingerprintSecret(input.platform.apiKey),
      source: "platform",
    };
  }

  throw new AppError("model_not_configured", "No model API key configured for this tenant", 422);
}
