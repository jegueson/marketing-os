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
  };
  if (env.SUPABASE_URL) config.supabaseUrl = env.SUPABASE_URL;
  if (env.SUPABASE_JWT_SECRET) config.supabaseJwtSecret = env.SUPABASE_JWT_SECRET;
  if (env.SUPABASE_JWKS_URL) config.supabaseJwksUrl = env.SUPABASE_JWKS_URL;
  if (env.TURNSTILE_SECRET_KEY) config.turnstileSecret = env.TURNSTILE_SECRET_KEY;
  if (env.MAILPIT_URL) config.mailpitUrl = env.MAILPIT_URL;
  if (env.MOS_DATA_KEY) config.dataKey = env.MOS_DATA_KEY;
  return config;
}
