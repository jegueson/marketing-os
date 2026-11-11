import { isDeploymentMode, type DeploymentMode } from "@marketing-os/core";

export type AppEnv = {
  deploymentMode: DeploymentMode;
  appOrigin: string;
  databaseUrl: string;
  supabaseUrl?: string;
  supabaseJwtSecret?: string;
  supabaseJwksUrl?: string;
  turnstileSecret?: string;
  mailpitUrl?: string;
  emailFrom: string;
  dataKey?: string;
  dataKeyVersion: number;
  previousDataKeys: Record<number, string>;
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Validates bindings once per request. Missing required config throws, and the
 * error handler turns it into a 500 envelope without details.
 */
export function loadEnv(env: Env): AppEnv {
  const mode = env.MOS_DEPLOYMENT_MODE ?? "self_hosted";
  if (!isDeploymentMode(mode)) {
    throw new ConfigError(`Invalid MOS_DEPLOYMENT_MODE: ${mode}`);
  }
  const databaseUrl = env.DATABASE_URL ?? env.HYPERDRIVE?.connectionString;
  if (!databaseUrl) {
    throw new ConfigError("DATABASE_URL or HYPERDRIVE binding is required");
  }
  if (!env.SUPABASE_JWKS_URL && !env.SUPABASE_JWT_SECRET) {
    throw new ConfigError("SUPABASE_JWKS_URL or SUPABASE_JWT_SECRET is required");
  }
  const config: AppEnv = {
    deploymentMode: mode,
    appOrigin: env.APP_ORIGIN ?? "http://127.0.0.1:3000",
    databaseUrl,
    emailFrom: env.EMAIL_FROM ?? "noreply@marketing-os.local",
    dataKeyVersion: 1,
    previousDataKeys: {},
  };
  if (env.SUPABASE_URL) config.supabaseUrl = env.SUPABASE_URL;
  if (env.SUPABASE_JWT_SECRET) config.supabaseJwtSecret = env.SUPABASE_JWT_SECRET;
  if (env.SUPABASE_JWKS_URL) config.supabaseJwksUrl = env.SUPABASE_JWKS_URL;
  if (env.TURNSTILE_SECRET_KEY) config.turnstileSecret = env.TURNSTILE_SECRET_KEY;
  if (env.MAILPIT_URL) config.mailpitUrl = env.MAILPIT_URL;
  if (env.MOS_DATA_KEY) {
    assertDataKey(env.MOS_DATA_KEY, "MOS_DATA_KEY");
    config.dataKey = env.MOS_DATA_KEY;
  }
  if (env.MOS_DATA_KEY_VERSION) {
    const version = Number(env.MOS_DATA_KEY_VERSION);
    if (!Number.isInteger(version) || version < 1) {
      throw new ConfigError("MOS_DATA_KEY_VERSION must be a positive integer");
    }
    config.dataKeyVersion = version;
  }
  const bag = env as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(bag)) {
    const match = /^MOS_DATA_KEY_V(\d+)$/.exec(key);
    if (!match || typeof value !== "string" || !value) continue;
    const version = Number(match[1]);
    if (version === config.dataKeyVersion) continue;
    assertDataKey(value, key);
    config.previousDataKeys[version] = value;
  }
  return config;
}

function assertDataKey(value: string, name: string): void {
  let decoded: string;
  try {
    decoded = atob(value);
  } catch {
    throw new ConfigError(`${name} is not valid base64`);
  }
  if (decoded.length !== 32) throw new ConfigError(`${name} must be 32 bytes, base64 encoded`);
}
