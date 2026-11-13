import { GA4_AUTHORIZATION_URL, GA4_SCOPES, requestGa4Token } from "@marketing-os/connector-google-analytics";
import type { OAuthProvider } from "./mock-oauth";

/** Builds the Google OAuth client from Worker secrets. Missing secrets stay unconfigured. */
export function ga4ProviderFromEnv(env: Env): OAuthProvider | null {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    authorizationUrl: `${GA4_AUTHORIZATION_URL}?access_type=offline&prompt=consent`,
    clientId,
    scopes: [...GA4_SCOPES],
    exchangeCode: (input) => requestGa4Token({ ...input, clientId, clientSecret }),
    refresh: (refreshToken) => requestGa4Token({ refreshToken, clientId, clientSecret }),
  };
}
