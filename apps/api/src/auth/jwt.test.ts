import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { verifySupabaseJwt } from "./jwt";

const secret = new TextEncoder().encode("test-secret-key-at-least-32-bytes!!");

async function mint(claims: Record<string, unknown>, expOffsetSec = 60) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(claims.sub ?? "user-1"))
    .setAudience("authenticated")
    .setExpirationTime(`${expOffsetSec}s`)
    .sign(secret);
}

describe("verifySupabaseJwt", () => {
  it("accepts a valid token", async () => {
    const token = await mint({ sub: "u1", email: "a@b.c" });
    const verified = await verifySupabaseJwt(token, {
      jwtSecret: "test-secret-key-at-least-32-bytes!!",
    });
    expect(verified.userId).toBe("u1");
  });

  it("rejects expired tokens", async () => {
    const token = await mint({ sub: "u1" }, -10);
    await expect(
      verifySupabaseJwt(token, { jwtSecret: "test-secret-key-at-least-32-bytes!!" }),
    ).rejects.toThrow(/Invalid or expired/);
  });

  it("rejects the wrong audience", async () => {
    const token = await new SignJWT({ sub: "u1" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setAudience("anon")
      .setExpirationTime("60s")
      .sign(secret);
    await expect(
      verifySupabaseJwt(token, { jwtSecret: "test-secret-key-at-least-32-bytes!!" }),
    ).rejects.toThrow(/Invalid or expired/);
  });

  it("rejects a bad signature", async () => {
    const token = await mint({ sub: "u1" });
    await expect(
      verifySupabaseJwt(token, { jwtSecret: "another-secret-key-at-least-32-bytes" }),
    ).rejects.toThrow(/Invalid or expired/);
  });

  it("rejects the wrong issuer when one is configured", async () => {
    const token = await mint({ sub: "u1" });
    await expect(
      verifySupabaseJwt(token, {
        jwtSecret: "test-secret-key-at-least-32-bytes!!",
        issuer: "https://project.supabase.co/auth/v1",
      }),
    ).rejects.toThrow(/Invalid or expired/);
  });

  it("rejects missing token configuration", async () => {
    await expect(verifySupabaseJwt("x.y.z", {})).rejects.toThrow();
  });
});
