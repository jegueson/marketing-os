import { describe, expect, it } from "vitest";
import { assertTenantObjectKey, buildTenantObjectKey, KnowledgeIngestError } from "./object-key";

const tenantId = "11111111-1111-4111-8111-111111111111";

describe("buildTenantObjectKey", () => {
  it("prefixes a bare locator with the tenant id", () => {
    expect(buildTenantObjectKey(tenantId, "notes/brand.md")).toBe(`${tenantId}/notes/brand.md`);
  });

  it("refuses a locator that would leave the tenant prefix", () => {
    expect(() => buildTenantObjectKey(tenantId, "../other/secret.md")).toThrow(KnowledgeIngestError);
    expect(() => buildTenantObjectKey(tenantId, "https://evil.example/x")).toThrow(KnowledgeIngestError);
    expect(() => buildTenantObjectKey(tenantId, ".hidden")).toThrow(KnowledgeIngestError);
  });
});

describe("assertTenantObjectKey", () => {
  it("accepts keys under the tenant prefix", () => {
    expect(() => assertTenantObjectKey(tenantId, `${tenantId}/notes/brand.md`)).not.toThrow();
  });

  it("refuses keys that escape the tenant prefix", () => {
    const cases = [
      `${tenantId}/../${tenantId}/notes.md`,
      `other-tenant/notes.md`,
      `/${tenantId}/notes.md`,
      `https://cdn.example/${tenantId}/notes.md`,
      `${tenantId}/`,
      "notes/brand.md",
    ];
    for (const objectKey of cases) {
      expect(() => assertTenantObjectKey(tenantId, objectKey), objectKey).toThrow(
        /object key must stay inside the tenant prefix/,
      );
    }
  });
});
