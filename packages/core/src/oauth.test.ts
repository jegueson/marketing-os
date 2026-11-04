import { describe, expect, it } from "vitest";
import { buildAuthorizationUrl, createPkcePair } from "./oauth";

describe("oauth pkce", () => {
  it("creates verifier and challenge", async () => {
    const pair = await createPkcePair();
    expect(pair.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(pair.codeChallenge.length).toBeGreaterThan(10);
    expect(pair.state.length).toBeGreaterThan(10);
  });

  it("builds authorization urls", async () => {
    const pair = await createPkcePair();
    const url = buildAuthorizationUrl({
      authorizationUrl: "https://example.com/oauth/authorize",
      clientId: "client",
      redirectUri: "https://api.example.com/callback",
      scope: ["openid"],
      state: pair.state,
      codeChallenge: pair.codeChallenge,
    });
    expect(url).toContain("code_challenge_method=S256");
  });
});
