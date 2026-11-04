import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, importMasterKey } from "./crypto";

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
});
