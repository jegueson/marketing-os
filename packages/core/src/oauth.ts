import { z } from "zod";

export const oauthStateSchema = z.object({
  state: z.string().min(16),
  codeVerifier: z.string().min(43),
  connectorSlug: z.string(),
  tenantId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  redirectUri: z.string().url(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export type OAuthState = z.infer<typeof oauthStateSchema>;

function randomUrlSafe(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createPkcePair(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}> {
  const codeVerifier = randomUrlSafe(32);
  const state = randomUrlSafe(24);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return { codeVerifier, codeChallenge, state };
}

export function buildAuthorizationUrl(input: {
  authorizationUrl: string;
  clientId: string;
  redirectUri: string;
  scope: string[];
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(input.authorizationUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", input.scope.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}
