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
  if (raw.byteLength !== 32) {
    throw new Error("MOS_DATA_KEY must be 32 bytes");
  }
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export type KeyMaterial = { version: number; base64: string };

export type KeyRing = {
  activeVersion: number;
  seal: (plaintext: string) => Promise<EncryptedBlob>;
  open: (blob: EncryptedBlob) => Promise<{ plaintext: string; blob: EncryptedBlob; rotated: boolean }>;
};

function decodeKey(base64: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new Error("MOS_DATA_KEY is not valid base64");
  }
  const raw = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) raw[i] = binary.charCodeAt(i);
  return raw;
}

/** Active key plus any previous versions kept for lazy rotation. */
export async function openKeyRing(activeVersion: number, materials: KeyMaterial[]): Promise<KeyRing> {
  const keys = new Map<number, CryptoKey>();
  for (const material of materials) {
    keys.set(material.version, await importMasterKey(decodeKey(material.base64)));
  }
  const active = keys.get(activeVersion);
  if (!active) throw new Error(`Active data key version ${activeVersion} is not loaded`);

  return {
    activeVersion,
    seal(plaintext) {
      return encryptSecret(plaintext, active, activeVersion);
    },
    async open(blob) {
      const key = keys.get(blob.keyVersion);
      if (!key) throw new Error(`Unknown data key version ${blob.keyVersion}`);
      let plaintext: string;
      try {
        plaintext = await decryptSecret(blob, key);
      } catch {
        throw new Error("Credential ciphertext failed authentication");
      }
      if (blob.keyVersion === activeVersion) return { plaintext, blob, rotated: false };
      return { plaintext, blob: await encryptSecret(plaintext, active, activeVersion), rotated: true };
    },
  };
}

/** Maps the in-memory blob onto credential_references columns (nonce, text key version). */
export function toStoredCredential(blob: EncryptedBlob): {
  ciphertext: string;
  nonce: string;
  keyVersion: string;
} {
  return { ciphertext: blob.ciphertext, nonce: blob.iv, keyVersion: String(blob.keyVersion) };
}

export function fromStoredCredential(row: {
  ciphertext: string;
  nonce: string;
  keyVersion: string;
}): EncryptedBlob {
  const keyVersion = Number(row.keyVersion);
  if (!Number.isInteger(keyVersion) || keyVersion < 1) throw new Error("Invalid key version");
  return { ciphertext: row.ciphertext, iv: row.nonce, keyVersion };
}
