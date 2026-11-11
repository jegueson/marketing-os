import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, fromStoredCredential, importMasterKey, openKeyRing, toStoredCredential } from "./crypto";

function encodedKey(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of raw) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe("credential encryption", () => {
  it("round-trips secrets with key version", async () => {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const key = await importMasterKey(raw);
    const blob = await encryptSecret("super-secret-token", key, 1);
    expect(blob.keyVersion).toBe(1);
    expect(blob.ciphertext).not.toContain("super-secret");
    const plain = await decryptSecret(blob, key);
    expect(plain).toBe("super-secret-token");
  });

  it("rejects a key that is not 32 bytes", async () => {
    await expect(importMasterKey(new Uint8Array(16))).rejects.toThrow(/32 bytes/);
  });

  it("decrypts a previous key version and re-encrypts with the active key", async () => {
    const previous = encodedKey();
    const current = encodedKey();
    const oldRing = await openKeyRing(1, [{ version: 1, base64: previous }]);
    const sealed = await oldRing.seal("ya29.fixture-token");
    const ring = await openKeyRing(2, [
      { version: 1, base64: previous },
      { version: 2, base64: current },
    ]);
    const opened = await ring.open(sealed);
    expect(opened.plaintext).toBe("ya29.fixture-token");
    expect(opened.rotated).toBe(true);
    expect(opened.blob.keyVersion).toBe(2);
    const stored = toStoredCredential(opened.blob);
    expect(fromStoredCredential(stored)).toEqual(opened.blob);
    expect(stored.nonce).toBe(opened.blob.iv);
  });

  it("rejects tampered ciphertext", async () => {
    const ring = await openKeyRing(1, [{ version: 1, base64: encodedKey() }]);
    const sealed = await ring.seal("ya29.fixture-token");
    const flipped = `${sealed.ciphertext.slice(0, -2)}aa`;
    await expect(ring.open({ ...sealed, ciphertext: flipped })).rejects.toThrow(/authentication/);
  });
});
