export type EncryptedBlob = {
  ciphertext: string;
  iv: string;
  keyVersion: number;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/** Envelope encryption with WebCrypto AES-GCM (Workers / modern Node). */
export async function encryptSecret(
  plaintext: string,
  masterKey: CryptoKey,
  keyVersion: number,
): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, masterKey, encoded);
  return {
    ciphertext: bytesToBase64(new Uint8Array(cipher)),
    iv: bytesToBase64(iv),
    keyVersion,
  };
}

export async function decryptSecret(
  blob: EncryptedBlob,
  masterKey: CryptoKey,
): Promise<string> {
  const iv = base64ToBytes(blob.iv);
  const ciphertext = base64ToBytes(blob.ciphertext);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    masterKey,
    ciphertext as BufferSource,
  );
  return new TextDecoder().decode(plain);
}

export async function importMasterKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
