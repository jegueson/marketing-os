import { ConnectorError } from "@marketing-os/connector-sdk";

export type OAuthTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type OAuthProvider = {
  authorizationUrl: string;
  clientId: string;
  scopes: string[];
  exchangeCode(input: { code: string; codeVerifier: string; redirectUri: string }): Promise<OAuthTokenSet>;
  refresh(refreshToken: string): Promise<OAuthTokenSet>;
};

/** In-process provider so local OAuth can be proven without a vendor sandbox. */
export function createMockOAuthProvider(): OAuthProvider {
  return {
    authorizationUrl: "https://oauth.test/authorize",
    clientId: "mock",
    scopes: ["read"],
    async exchangeCode({ code }) {
      if (code === "good") return { accessToken: "access-token", refreshToken: "rt-secret", expiresIn: 3600 };
      if (code === "grant-revoked") return { accessToken: "access-token", refreshToken: "refresh-revoked", expiresIn: 3600 };
      if (code === "grant-expired") return { accessToken: "access-token", refreshToken: "expired", expiresIn: 3600 };
      throw new ConnectorError("Authorization code was rejected", "auth_failed");
    },
    async refresh(refreshToken) {
      if (refreshToken === "refresh-revoked") throw new ConnectorError("Access was revoked", "access_revoked");
      if (refreshToken === "expired") throw new ConnectorError("Access expired", "auth_expired");
      if (refreshToken === "permission") throw new ConnectorError("Permission changed", "permission_changed");
      if (refreshToken === "version") throw new ConnectorError("Provider API version changed", "api_version_error");
      return { accessToken: "access-token-2", refreshToken, expiresIn: 3600 };
    },
  };
}
