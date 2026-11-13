import { ConnectorError } from "@marketing-os/connector-sdk";

/** Graph API version from the Marketing API docs. */
export const META_GRAPH_VERSION = "v26.0";
export const META_AUTHORIZATION_URL = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`;
export const META_TOKEN_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`;
export const META_SCOPES = ["ads_read"] as const;

export type MetaTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

type TokenRequest = {
  fetch?: typeof fetch;
  clientId: string;
  clientSecret: string;
  code?: string;
  codeVerifier?: string;
  redirectUri?: string;
  refreshToken?: string;
};

/**
 * Exchanges an authorization code for a long-lived token.
 * The long-lived token is also the refresh token: Meta extends it by exchanging it again.
 * Error text never includes the app secret or the token values.
 */
export async function requestMetaToken(input: TokenRequest): Promise<MetaTokenSet> {
  if (!input.clientId || !input.clientSecret) throw new ConnectorError("Meta app is not configured", "invalid_input");
  const fetchImpl = input.fetch ?? globalThis.fetch.bind(globalThis);
  if (input.refreshToken) return exchangeLongLived(fetchImpl, input.clientId, input.clientSecret, input.refreshToken);
  if (!input.code || !input.redirectUri) throw new ConnectorError("Authorization code is incomplete", "invalid_input");
  const shortLived = await tokenRequest(fetchImpl, {
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
  });
  return exchangeLongLived(fetchImpl, input.clientId, input.clientSecret, shortLived.accessToken);
}

async function exchangeLongLived(fetchImpl: typeof fetch, clientId: string, clientSecret: string, token: string): Promise<MetaTokenSet> {
  const extended = await tokenRequest(fetchImpl, {
    grant_type: "fb_exchange_token",
    client_id: clientId,
    client_secret: clientSecret,
    fb_exchange_token: token,
  });
  return { accessToken: extended.accessToken, refreshToken: extended.accessToken, expiresIn: extended.expiresIn };
}

async function tokenRequest(fetchImpl: typeof fetch, fields: Record<string, string>): Promise<{ accessToken: string; expiresIn: number }> {
  let response: Response;
  try {
    response = await fetchImpl(META_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams(fields).toString(),
    });
  } catch {
    throw new ConnectorError("Meta token request failed", "provider_error", true);
  }
  if (!response.ok) {
    await response.text();
    throw new ConnectorError("Meta rejected the token request", response.status === 401 ? "auth_expired" : "auth_failed");
  }
  const payload = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof payload.access_token !== "string" || !payload.access_token) {
    throw new ConnectorError("Meta did not return an access token", "auth_failed");
  }
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 5_184_000;
  return { accessToken: payload.access_token, expiresIn };
}
