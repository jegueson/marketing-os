import { describe, expect, it } from "vitest";
import { publicLeadCreateSchema } from "./leads";
import { cockpitViewSchema } from "./workspace";

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

  it("normalizes email case and defaults intent", () => {
    const parsed = publicLeadCreateSchema.parse({
      companyName: " Acme ",
      contactName: "Ada",
      email: "Ada@Acme.Test",
    });
    expect(parsed).toMatchObject({ companyName: "Acme", email: "ada@acme.test", intent: "expert_services" });
  });

  it("rejects unknown intents and oversized fields", () => {
    const base = { companyName: "Acme", contactName: "Ada", email: "ada@acme.test" };
    expect(publicLeadCreateSchema.safeParse({ ...base, intent: "enterprise" }).success).toBe(false);
    expect(publicLeadCreateSchema.safeParse({ ...base, companyName: "x".repeat(201) }).success).toBe(false);
    expect(publicLeadCreateSchema.safeParse({ ...base, majorProblem: "x".repeat(5001) }).success).toBe(false);
  });
});

describe("cockpitViewSchema", () => {
  it("accepts the Sprint 1 empty shell", () => {
    const view = {
      header: {
        workspaceId: "11111111-1111-4111-8111-111111111111",
        workspaceName: "Default",
        period: { from: "2026-10-01", to: "2026-10-31", label: "Last 30 days" },
        freshness: "empty",
      },
      kpi_cards: [],
      attention_queue: [],
      recommendations: [],
      data_health: [],
      empty_state: { message: "Connect a data source" },
    };
    expect(cockpitViewSchema.parse(view)).toEqual(view);
  });
});
