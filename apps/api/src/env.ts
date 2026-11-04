import { isDeploymentMode, type DeploymentMode } from "@marketing-os/core";

export type AppEnv = {
  deploymentMode: DeploymentMode;
  appOrigin: string;
  databaseUrl?: string;
  supabaseUrl?: string;
  supabaseJwtSecret?: string;
  supabaseJwksUrl?: string;
  dataKey?: string;
};

export function loadEnv(env: Env): AppEnv {
  const mode = env.MOS_DEPLOYMENT_MODE ?? "self_hosted";
  if (!isDeploymentMode(mode)) {
    throw new Error(`Invalid MOS_DEPLOYMENT_MODE: ${mode}`);
  }
  const config: AppEnv = {
    deploymentMode: mode,
    appOrigin: env.APP_ORIGIN ?? "http://127.0.0.1:3000",
  };
  const databaseUrl = env.DATABASE_URL ?? env.HYPERDRIVE?.connectionString;
  if (databaseUrl) config.databaseUrl = databaseUrl;
  if (env.SUPABASE_URL) config.supabaseUrl = env.SUPABASE_URL;
  if (env.SUPABASE_JWT_SECRET) config.supabaseJwtSecret = env.SUPABASE_JWT_SECRET;
  if (env.SUPABASE_JWKS_URL) config.supabaseJwksUrl = env.SUPABASE_JWKS_URL;
  if (env.MOS_DATA_KEY) config.dataKey = env.MOS_DATA_KEY;
  return config;
}
