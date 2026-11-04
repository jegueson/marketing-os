import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { UnauthorizedError } from "@marketing-os/core";

export type VerifiedToken = {
  userId: string;
  email?: string;
  payload: JWTPayload;
};

export async function verifySupabaseJwt(
  token: string,
  options: { jwksUrl?: string; jwtSecret?: string; audience?: string },
): Promise<VerifiedToken> {
  try {
    if (options.jwksUrl) {
      const JWKS = createRemoteJWKSet(new URL(options.jwksUrl));
      const { payload } = await jwtVerify(token, JWKS, {
        audience: options.audience ?? "authenticated",
      });
      const userId = typeof payload.sub === "string" ? payload.sub : null;
      if (!userId) {
        throw new UnauthorizedError("Token missing subject");
      }
      const verified: VerifiedToken = { userId, payload };
      if (typeof payload.email === "string") {
        verified.email = payload.email;
      }
      return verified;
    }

    if (options.jwtSecret) {
      const key = new TextEncoder().encode(options.jwtSecret);
      const { payload } = await jwtVerify(token, key, {
        audience: options.audience ?? "authenticated",
      });
      const userId = typeof payload.sub === "string" ? payload.sub : null;
      if (!userId) {
        throw new UnauthorizedError("Token missing subject");
      }
      const verified: VerifiedToken = { userId, payload };
      if (typeof payload.email === "string") {
        verified.email = payload.email;
      }
      return verified;
    }

    throw new UnauthorizedError("JWT verification is not configured");
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      throw err;
    }
    throw new UnauthorizedError("Invalid or expired token");
  }
}
