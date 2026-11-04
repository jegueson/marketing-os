interface Env {
  MOS_DEPLOYMENT_MODE: "self_hosted" | "cloud";
  MOS_DATA_KEY?: string;
  DATABASE_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_JWT_SECRET?: string;
  SUPABASE_JWKS_URL?: string;
  APP_ORIGIN?: string;
  HYPERDRIVE?: Hyperdrive;
  OUTBOX_QUEUE?: Queue;
  ASSETS_BUCKET?: R2Bucket;
}
