import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openKeyRing } from "@marketing-os/core";
import { connections, connectors, credentialReferences, tenants, withContext, workspaces } from "@marketing-os/db";
import { createTestDatabase, type TestDatabase } from "@marketing-os/db/testing";
import { loadConnectionCredentials, saveConnectionCredentials } from "./credentials";

function encodedKey(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of raw) binary += String.fromCharCode(byte);
  return btoa(binary);
}

let t: TestDatabase;
const tenantId = crypto.randomUUID();
const userId = crypto.randomUUID();
const keyV1 = encodedKey();
const secret = "ya29.fixture-token";
let connectionId = "";

beforeAll(async () => {
  t = await createTestDatabase();
  await t.createUser("cred@example.com", userId);
  await withContext(t.db, { tenantId, userId, staff: true }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantId, slug: "cred", name: "Cred" });
    const [workspace] = await tx
      .insert(workspaces)
      .values({ tenantId, slug: "default", name: "Default" })
      .returning();
    const [mock] = await tx.select().from(connectors).where(eq(connectors.slug, "mock"));
    const [connection] = await tx
      .insert(connections)
      .values({
        tenantId,
        workspaceId: workspace!.id,
        connectorId: mock!.id,
        displayName: "Mock",
        createdBy: userId,
      })
      .returning();
    connectionId = connection!.id;
    const ring = await openKeyRing(1, [{ version: 1, base64: keyV1 }]);
    await saveConnectionCredentials(tx, {
      connectionId,
      tenantId,
      ring,
      credentials: { refresh_token: secret },
    });
  });
}, 60_000);

afterAll(async () => {
  await t.close();
});

describe("connection credentials", () => {
  it("stores ciphertext and decrypts it after a key bump", async () => {
    const [stored] = await t.db
      .select()
      .from(credentialReferences)
      .where(eq(credentialReferences.connectionId, connectionId));
    expect(stored?.ciphertext).not.toContain(secret);
    expect(stored?.keyVersion).toBe("1");
    expect(stored?.nonce.length).toBeGreaterThan(0);

    const ring = await openKeyRing(2, [
      { version: 1, base64: keyV1 },
      { version: 2, base64: encodedKey() },
    ]);
    const loaded = await withContext(t.db, { tenantId, userId, staff: false }, (tx) =>
      loadConnectionCredentials(tx, connectionId, ring),
    );
    expect(loaded.refresh_token).toBe(secret);
    const [rotated] = await t.db
      .select({ keyVersion: credentialReferences.keyVersion, ciphertext: credentialReferences.ciphertext })
      .from(credentialReferences)
      .where(eq(credentialReferences.connectionId, connectionId));
    expect(rotated?.keyVersion).toBe("2");
    expect(rotated?.ciphertext).not.toContain(secret);

    await t.db
      .update(credentialReferences)
      .set({ ciphertext: `${rotated!.ciphertext.slice(0, -2)}aa` })
      .where(eq(credentialReferences.connectionId, connectionId));
    await expect(
      withContext(t.db, { tenantId, userId, staff: false }, (tx) => loadConnectionCredentials(tx, connectionId, ring)),
    ).rejects.toThrow(/could not be decrypted/);
  });
});
