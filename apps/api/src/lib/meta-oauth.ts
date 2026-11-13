import { META_AUTHORIZATION_URL, META_SCOPES, requestMetaToken } from "@marketing-os/connector-meta";
import type { OAuthProvider } from "./mock-oauth";

/** Builds the Meta OAuth client from Worker secrets. Missing secrets stay unconfigured. */
export function metaProviderFromEnv(env: Env): OAuthProvider | null {
  const clientId = env.META_APP_ID;
  const clientSecret = env.META_APP_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    authorizationUrl: META_AUTHORIZATION_URL,
    clientId,
    scopes: [...META_SCOPES],
    exchangeCode: (input) => requestMetaToken({ ...input, clientId, clientSecret }),
    refresh: (refreshToken) => requestMetaToken({ refreshToken, clientId, clientSecret }),
  };
}
