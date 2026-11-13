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
  /** Shared Google OAuth client for GA4 and Google Ads. Both are required before /oauth/start. */
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  /** Google Ads test-account developer token. Required before Ads OAuth or sync. */
  GOOGLE_ADS_DEVELOPER_TOKEN?: string;
  /** HubSpot OAuth app. Both are required before HubSpot /oauth/start. */
  HUBSPOT_CLIENT_ID?: string;
  HUBSPOT_CLIENT_SECRET?: string;
  /** Meta app. Both are required before Meta /oauth/start. ads_read still needs App Review. */
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  HYPERDRIVE?: Hyperdrive;
  OUTBOX_QUEUE?: Queue;
  SYNC_QUEUE?: Queue;
  ASSETS_BUCKET?: R2Bucket;
  PUBLIC_LEADS_RATE_LIMITER?: RateLimit;
  EMAIL?: import("@marketing-os/core").CloudflareSendEmailBinding;
}
