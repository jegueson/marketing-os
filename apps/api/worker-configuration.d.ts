interface Env {
  MOS_DEPLOYMENT_MODE: "self_hosted" | "cloud";
  MOS_DATA_KEY?: string;
  /** Active key version. Defaults to 1. Previous material lives in MOS_DATA_KEY_V1, MOS_DATA_KEY_V2, ... */
  MOS_DATA_KEY_VERSION?: string;
  MOS_DATA_KEY_V1?: string;
  DATABASE_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_JWT_SECRET?: string;
  SUPABASE_JWKS_URL?: string;
  APP_ORIGIN?: string;
  TURNSTILE_SECRET_KEY?: string;
  MAILPIT_URL?: string;
  EMAIL_FROM?: string;
  HYPERDRIVE?: Hyperdrive;
  OUTBOX_QUEUE?: Queue;
  SYNC_QUEUE?: Queue;
  ASSETS_BUCKET?: R2Bucket;
  PUBLIC_LEADS_RATE_LIMITER?: RateLimit;
  EMAIL?: import("@marketing-os/core").CloudflareSendEmailBinding;
}
