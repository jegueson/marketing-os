import { ConnectorError } from "@marketing-os/connector-sdk";

export const GA4_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GA4_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GA4_SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"] as const;

export type Ga4TokenSet = {
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
 * Exchanges a Google authorization code or refresh token.
 * Error text never includes the client secret or the token values.
 */
export async function requestGa4Token(input: TokenRequest): Promise<Ga4TokenSet> {
  if (!input.clientId || !input.clientSecret) {
    throw new ConnectorError("Google OAuth client is not configured", "invalid_input");
  }
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
  });
  if (input.refreshToken) {
    body.set("grant_type", "refresh_token");
    body.set("refresh_token", input.refreshToken);
  } else {
    if (!input.code || !input.codeVerifier || !input.redirectUri) {
      throw new ConnectorError("Authorization code is incomplete", "invalid_input");
    }
    body.set("grant_type", "authorization_code");
    body.set("code", input.code);
    body.set("code_verifier", input.codeVerifier);
    body.set("redirect_uri", input.redirectUri);
  }
  const fetchImpl = input.fetch ?? globalThis.fetch.bind(globalThis);
  let response: Response;
  try {
    response = await fetchImpl(GA4_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: body.toString(),
    });
  } catch {
    throw new ConnectorError("Google token request failed", "provider_error", true);
  }
  if (!response.ok) {
    await response.text();
    throw new ConnectorError(
      input.refreshToken ? "Google rejected the refresh token" : "Google rejected the authorization code",
      response.status === 401 ? "auth_expired" : "auth_failed",
    );
  }
  const payload = (await response.json()) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
  if (typeof payload.access_token !== "string" || !payload.access_token) {
    throw new ConnectorError("Google did not return an access token", "auth_failed");
  }
  const refreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token : input.refreshToken;
  if (!refreshToken) throw new ConnectorError("Google did not return a refresh token", "auth_failed");
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
  return { accessToken: payload.access_token, refreshToken, expiresIn };
}
