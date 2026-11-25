import { knowledgeSourceSchema } from "@marketing-os/schemas";

/** Fixed embedding width for knowledge chunks (ADR-0026 §8). */
export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 1536;

export class KnowledgeIngestError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "KnowledgeIngestError";
    this.code = code;
  }
}

/**
 * Resolve a bare locator under the tenant prefix. Rejects locators that Zod would
 * already reject, and any key that would escape `${tenantId}/`.
 */
export function buildTenantObjectKey(tenantId: string, locator: string): string {
  if (!tenantId || tenantId.includes("/") || tenantId.includes("..")) {
    throw new KnowledgeIngestError("invalid_tenant", "tenant id is not a safe object prefix");
  }
  const parsed = knowledgeSourceSchema.shape.locator.safeParse(locator);
  if (!parsed.success) {
    throw new KnowledgeIngestError("invalid_locator", "locator must be a bare key under the tenant prefix");
  }
  const key = `${tenantId}/${parsed.data}`;
  assertTenantObjectKey(tenantId, key);
  return key;
}

/** Refuse any object key that is not exactly `${tenantId}/…` with a bare locator. */
export function assertTenantObjectKey(tenantId: string, objectKey: string): void {
  const prefix = `${tenantId}/`;
  if (!objectKey.startsWith(prefix) || objectKey === prefix) {
    throw new KnowledgeIngestError(
      "object_key_escape",
      "object key must stay inside the tenant prefix",
    );
  }
  if (objectKey.includes("..") || objectKey.includes("//") || objectKey.startsWith("/") || objectKey.includes("://")) {
    throw new KnowledgeIngestError(
      "object_key_escape",
      "object key must stay inside the tenant prefix",
    );
  }
  const rest = objectKey.slice(prefix.length);
  const parsed = knowledgeSourceSchema.shape.locator.safeParse(rest);
  if (!parsed.success || `${tenantId}/${parsed.data}` !== objectKey) {
    throw new KnowledgeIngestError(
      "object_key_escape",
      "object key must stay inside the tenant prefix",
    );
  }
}
