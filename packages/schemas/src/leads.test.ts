import { describe, expect, it } from "vitest";
import { publicLeadCreateSchema } from "./leads";

describe("publicLeadCreateSchema", () => {
  it("accepts a valid payload", () => {
    const parsed = publicLeadCreateSchema.parse({
      companyName: "Acme",
      contactName: "Ada",
      email: "ada@acme.test",
      intent: "cloud_workspace",
    });
    expect(parsed.companyName).toBe("Acme");
  });

  it("rejects honeypot fills", () => {
    expect(() =>
      publicLeadCreateSchema.parse({
        companyName: "Acme",
        contactName: "Ada",
        email: "ada@acme.test",
        intent: "cloud_workspace",
        website: "https://spam.example",
      }),
    ).toThrow();
  });
});
