import { GOOGLE_ADS_AUTHORIZATION_URL, GOOGLE_ADS_SCOPES, requestGoogleAdsToken } from "@marketing-os/connector-google-ads";
import type { OAuthProvider } from "./mock-oauth";

/**
 * Uses the same Google OAuth client id and secret as GA4, with the Ads scope.
 * The developer token is checked by the caller and is not part of this client.
 */
export function googleAdsProviderFromEnv(env: Env): OAuthProvider | null {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    authorizationUrl: `${GOOGLE_ADS_AUTHORIZATION_URL}?access_type=offline&prompt=consent`,
    clientId,
    scopes: [...GOOGLE_ADS_SCOPES],
    exchangeCode: (input) => requestGoogleAdsToken({ ...input, clientId, clientSecret }),
    refresh: (refreshToken) => requestGoogleAdsToken({ refreshToken, clientId, clientSecret }),
  };
}
