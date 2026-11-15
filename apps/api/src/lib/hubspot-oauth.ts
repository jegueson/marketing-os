import { HUBSPOT_AUTHORIZATION_URL, HUBSPOT_SCOPES, requestHubSpotToken } from "@marketing-os/connector-hubspot";
import type { OAuthProvider } from "./mock-oauth";

/** Builds the HubSpot OAuth client from Worker secrets. Missing secrets stay unconfigured. */
export function hubspotProviderFromEnv(env: Env): OAuthProvider | null {
  const clientId = env.HUBSPOT_CLIENT_ID;
  const clientSecret = env.HUBSPOT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    authorizationUrl: HUBSPOT_AUTHORIZATION_URL,
    clientId,
    scopes: [...HUBSPOT_SCOPES],
    exchangeCode: (input) => requestHubSpotToken({ ...input, clientId, clientSecret }),
    refresh: (refreshToken) => requestHubSpotToken({ refreshToken, clientId, clientSecret }),
  };
}
