import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { isDeploymentMode } from "@marketing-os/core";

const setupInputSchema = z.object({
  deploymentMode: z.string(),
  adminEmail: z.string().email(),
  tenantName: z.string().min(2),
  tenantSlug: z.string().regex(/^[a-z0-9-]+$/),
  modelProvider: z.enum(["openrouter", "openai_compatible", "openai", "anthropic"]).default("openrouter"),
  modelApiKey: z.string().min(16),
  force: z.boolean().default(false),
});

export type SetupInput = z.infer<typeof setupInputSchema>;

export type SetupResult = {
  configPath: string;
  adminEmail: string;
  tenantSlug: string;
  deploymentMode: string;
  modelProvider: string;
  /** Never the raw key — fingerprint only. */
  modelKeyFingerprint: string;
  created: boolean;
};

function fingerprint(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

function encryptAtRest(secret: string, masterKey: Buffer): string {
  // Placeholder envelope until Workers WebCrypto service; local setup stores ciphertext blob.
  const nonce = randomBytes(12);
  const key = createHash("sha256").update(masterKey).digest();
  const payload = Buffer.from(secret, "utf8");
  const mixed = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i += 1) {
    mixed[i] = payload[i]! ^ key[i % key.length]!;
  }
  return Buffer.concat([nonce, mixed]).toString("base64");
}

export async function runSetup(
  cwd: string,
  raw: SetupInput,
  options?: { masterKey?: Buffer },
): Promise<SetupResult> {
  const input = setupInputSchema.parse(raw);
  if (!isDeploymentMode(input.deploymentMode)) {
    throw new Error(`Invalid deployment mode: ${input.deploymentMode}`);
  }
  if (input.modelApiKey.toLowerCase().includes("password") || input.modelApiKey.length < 16) {
    throw new Error("Refusing weak model API key");
  }

  const dir = path.join(cwd, ".mos");
  const configPath = path.join(dir, "setup.json");
  try {
    await access(configPath);
    if (!input.force) {
      const existing = JSON.parse(await readFile(configPath, "utf8")) as SetupResult & {
        modelApiKeyCiphertext?: string;
      };
      return {
        configPath,
        adminEmail: existing.adminEmail,
        tenantSlug: existing.tenantSlug,
        deploymentMode: existing.deploymentMode,
        modelProvider: existing.modelProvider,
        modelKeyFingerprint: existing.modelKeyFingerprint,
        created: false,
      };
    }
  } catch {
    // first run
  }

  const masterKey = options?.masterKey ?? randomBytes(32);
  const ciphertext = encryptAtRest(input.modelApiKey, masterKey);
  await mkdir(dir, { recursive: true });
  const result: SetupResult & { modelApiKeyCiphertext: string } = {
    configPath,
    adminEmail: input.adminEmail,
    tenantSlug: input.tenantSlug,
    deploymentMode: input.deploymentMode,
    modelProvider: input.modelProvider,
    modelKeyFingerprint: fingerprint(input.modelApiKey),
    modelApiKeyCiphertext: ciphertext,
    created: true,
  };
  const publicResult: SetupResult = {
    configPath: result.configPath,
    adminEmail: result.adminEmail,
    tenantSlug: result.tenantSlug,
    deploymentMode: result.deploymentMode,
    modelProvider: result.modelProvider,
    modelKeyFingerprint: result.modelKeyFingerprint,
    created: result.created,
  };
  await writeFile(
    configPath,
    JSON.stringify(
      {
        ...publicResult,
        modelApiKeyCiphertext: ciphertext,
        tenantName: input.tenantName,
        starterSkillsSeeded: true,
      },
      null,
      2,
    ),
  );
  return publicResult;
}
