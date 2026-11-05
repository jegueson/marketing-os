import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import { UnauthorizedError } from "@marketing-os/core";

export type VerifiedToken = {
  userId: string;
  email?: string;
  payload: JWTPayload;
};

export type JwtOptions = {
  jwksUrl?: string;
  jwtSecret?: string;
  audience?: string;
  issuer?: string;
};

const jwksCache = new Map<string, JWTVerifyGetKey>();

function jwks(url: string): JWTVerifyGetKey {
  const cached = jwksCache.get(url);
  if (cached) return cached;
  const set = createRemoteJWKSet(new URL(url));
  jwksCache.set(url, set);
  return set;
}

/**
 * Verifies a Supabase access token. Asymmetric keys (JWKS) are tried first;
 * the shared secret covers local Supabase and tests.
 */
export async function verifySupabaseJwt(token: string, options: JwtOptions): Promise<VerifiedToken> {
  const verifyOptions = {
    audience: options.audience ?? "authenticated",
    ...(options.issuer ? { issuer: options.issuer } : {}),
  };
  let payload: JWTPayload | null = null;
  try {
    if (options.jwksUrl) {
      try {
        payload = (await jwtVerify(token, jwks(options.jwksUrl), verifyOptions)).payload;
      } catch (err) {
        if (!options.jwtSecret) throw err;
      }
    }
    if (!payload && options.jwtSecret) {
      const key = new TextEncoder().encode(options.jwtSecret);
      payload = (await jwtVerify(token, key, verifyOptions)).payload;
    }
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }
  if (!payload) {
    throw new UnauthorizedError("JWT verification is not configured");
  }
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new UnauthorizedError("Token missing subject");
  }
  const verified: VerifiedToken = { userId: payload.sub, payload };
  if (typeof payload.email === "string") {
    verified.email = payload.email;
  }
  return verified;
}
