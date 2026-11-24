import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditEvents, staffAssignments, tenantMemberships } from "@marketing-os/db";
import { createHarness, provisionCustomer, type Harness, type ProvisionedCustomer, type TestUser } from "../testing/harness";

const businessDraft = {
  companyDescription: "Acme sells workflow software.",
  businessModel: "Subscription",
  products: ["Acme Cloud"],
  markets: ["United Kingdom"],
  businessGoals: ["Grow pipeline"],
  marketingGoals: ["Hold CAC"],
  primaryKpis: ["mock.spend"],
  reportingCadence: "weekly",
};

const brandDraft = {
  positioning: "The operating system for a marketing team.",
  audience: "Marketing leads at B2B software companies.",
  tone: ["direct"],
  preferredTerms: ["pipeline"],
  bannedTerms: ["synergy"],
  approvedClaims: ["Connects the tools you already use"],
  prohibitedClaims: ["Guarantees revenue"],
  marketLanguage: ["en-GB"],
  exampleAssetIds: [],
};

describe("profile API", () => {
  let h: Harness;
  let sm: TestUser;
  let specialist: TestUser;
  let acme: ProvisionedCustomer;
  let base: string;

  beforeEach(async () => {
    h = await createHarness();
    sm = await h.user("sm-profiles@example.com", "success_manager");
    specialist = await h.user("specialist-profiles@example.com", "ai_specialist");
    acme = await provisionCustomer(h, sm, "Acme Profiles", "owner-profiles@acme.test");
    await h.testDb.db.insert(staffAssignments).values({
      tenantId: acme.tenantId,
      userId: specialist.id,
      role: "ai_specialist",
    });
    base = `/api/v1/workspaces/${acme.workspaceId}/profiles/business`;
  });

  afterEach(() => h.close());

  async function enableConfig(): Promise<void> {
    await h.testDb.pg.query("update feature_flags set is_enabled = true where key = 'specialist_config'");
  }

  it("hides the routes until the flag is on, then enforces read and write", async () => {
    const hidden = await h.call(base, { token: specialist.token });
    expect(hidden.status).toBe(404);
    expect(hidden.body.error?.message).toBe("Not found");

    await enableConfig();
    expect((await h.call(base)).status).toBe(401);

    const reader = await h.user("reader-profiles@acme.test");
    await h.testDb.db.insert(tenantMemberships).values({
      tenantId: acme.tenantId,
      userId: reader.id,
      role: "customer_user",
    });
    expect((await h.call(base, { token: reader.token })).status).toBe(403);
    expect((await h.call(base, { token: acme.admin.token })).status).toBe(200);
    expect((await h.call(base, { method: "PUT", token: acme.admin.token, body: businessDraft })).status).toBe(403);
    expect((await h.call(base, { token: sm.token })).status).toBe(200);
    expect((await h.call(base, { method: "PUT", token: sm.token, body: businessDraft })).status).toBe(403);
  });

  it("lets a specialist publish and hides that profile from another tenant", async () => {
    await enableConfig();
    const saved = await h.call<{ kind: string; status: string; draft: { companyDescription: string } }>(base, {
      method: "PUT",
      token: specialist.token,
      body: businessDraft,
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data.draft.companyDescription).toBe(businessDraft.companyDescription);

    const published = await h.call<{ kind: string; version: number }>(`${base}/publish`, {
      method: "POST",
      token: specialist.token,
    });
    expect(published.status).toBe(200);
    expect(published.body.data).toEqual({ kind: "business", version: 1, status: "published" });

    const versions = await h.call<{ version: number }[]>(`${base}/versions`, { token: acme.admin.token });
    expect(versions.status).toBe(200);
    expect(versions.body.data.map((row) => row.version)).toEqual([1]);
    expect(JSON.stringify(versions.body)).not.toContain(businessDraft.companyDescription);

    const brand = await h.call<{ draft: { positioning: string } | null }>(
      `/api/v1/workspaces/${acme.workspaceId}/profiles/brand`,
      { method: "PUT", token: specialist.token, body: brandDraft },
    );
    expect(brand.status).toBe(200);
    expect(brand.body.data.draft?.positioning).toBe(brandDraft.positioning);

    const other = await provisionCustomer(h, sm, "Other Profiles", "owner-profiles@other.test");
    const cross = await h.call(`/api/v1/workspaces/${acme.workspaceId}/profiles/business`, {
      token: other.admin.token,
    });
    expect(cross.status).toBe(403);

    const audits = await h.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "config.profile_published"));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      tenantId: acme.tenantId,
      actorId: specialist.id,
      resourceType: "business_profile",
    });
    expect(JSON.stringify(audits[0]?.payload)).not.toContain(businessDraft.companyDescription);
  });

  it("rejects an invalid draft without echoing the document", async () => {
    await enableConfig();
    const phrase = "SECRET PHRASE do not echo";
    const rejected = await h.call(base, {
      method: "PUT",
      token: specialist.token,
      body: { ...businessDraft, companyDescription: phrase, sql: "select 1" },
    });
    expect(rejected.status).toBe(422);
    expect(JSON.stringify(rejected.body)).not.toContain(phrase);
    const rows = await h.call<{ draft: unknown }>(base, { token: specialist.token });
    expect(rows.body.data.draft).toBeNull();
  });
});
