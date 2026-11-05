import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { DisabledCaptcha, MemoryRateLimiter } from "./lib/abuse";
import { createHarness, type Harness } from "./testing/harness";

const lead = {
  companyName: "Acme",
  contactName: "Ada",
  email: "Ada@Acme.test",
  intent: "cloud_workspace",
};

describe("health", () => {
  it("returns healthz without config", async () => {
    const res = await createApp().request("/healthz", {}, {} as Env);
    expect(res.status).toBe(200);
  });

  it("reports not ready when config is missing", async () => {
    const res = await createApp().request("/readyz", {}, { MOS_DEPLOYMENT_MODE: "cloud" } as Env);
    expect(res.status).toBe(503);
  });
});

describe("public lead intake", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(() => h.close());

  it("rejects invalid payloads with 422", async () => {
    const res = await h.call("/api/v1/public/leads", { method: "POST", body: {} });
    expect(res.status).toBe(422);
  });

  it("rejects a filled honeypot", async () => {
    const res = await h.call("/api/v1/public/leads", { method: "POST", body: { ...lead, website: "spam" } });
    expect(res.status).toBe(422);
  });

  it("stores the lead, brief, source, outbox event and audit row", async () => {
    const res = await h.call<{ id: string; duplicate: boolean }>("/api/v1/public/leads", {
      method: "POST",
      body: { ...lead, notes: "Need help", utmSource: "linkedin" },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.duplicate).toBe(false);
    const { rows } = await h.testDb.pg.query<{ email: string; briefs: number; sources: number; events: number; audits: number }>(
      `select l.email,
        (select count(*)::int from lead_briefs where lead_id = l.id) briefs,
        (select count(*)::int from lead_sources where lead_id = l.id and utm_source = 'linkedin') sources,
        (select count(*)::int from outbox_events where event_type = 'lead.created') events,
        (select count(*)::int from audit_events where event_type = 'lead.created') audits
       from leads l where l.id = $1`,
      [res.body.data.id],
    );
    expect(rows[0]).toEqual({ email: "ada@acme.test", briefs: 1, sources: 1, events: 1, audits: 1 });
  });

  it("dedupes the same email within 24 hours", async () => {
    const first = await h.call<{ id: string }>("/api/v1/public/leads", { method: "POST", body: lead });
    const second = await h.call<{ id: string; duplicate: boolean }>("/api/v1/public/leads", {
      method: "POST",
      body: { ...lead, email: "ada@acme.TEST" },
    });
    expect(second.status).toBe(200);
    expect(second.body.data).toMatchObject({ id: first.body.data.id, duplicate: true });
  });

  it("rate limits per IP", async () => {
    const limited = await createHarness({ leadRateLimiter: () => new MemoryRateLimiter(0, 60_000) });
    const res = await limited.call("/api/v1/public/leads", { method: "POST", body: lead });
    expect(res.status).toBe(429);
    await limited.close();
  });

  it("returns 400 when the captcha fails", async () => {
    const failing = await createHarness({ captcha: () => new DisabledCaptcha("failed") });
    const res = await failing.call("/api/v1/public/leads", { method: "POST", body: lead });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("captcha_failed");
    await failing.close();
  });

  it("fails closed with 503 when cloud captcha is not configured", async () => {
    const cloud = await createHarness({ captcha: () => new DisabledCaptcha("not_configured") }, "cloud");
    const res = await cloud.call("/api/v1/public/leads", { method: "POST", body: lead });
    expect(res.status).toBe(503);
    await cloud.close();
  });
});

describe("authentication", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(() => h.close());

  it("rejects requests without a token", async () => {
    expect((await h.call("/api/v1/me")).status).toBe(401);
  });

  it("rejects a forged token", async () => {
    expect((await h.call("/api/v1/me", { token: "a.b.c" })).status).toBe(401);
  });

  it("ignores legacy identity headers", async () => {
    const res = await createApp().request(
      "/api/v1/leads",
      { headers: { "x-user-id": "11111111-1111-1111-1111-111111111111", "x-user-role": "platform_admin" } },
      h.env,
    );
    expect(res.status).toBe(401);
  });

  it("returns the caller with no memberships", async () => {
    const user = await h.user("solo@example.com");
    const res = await h.call<{ userId: string; staffRole: string | null; memberships: unknown[] }>("/api/v1/me", {
      token: user.token,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ userId: user.id, staffRole: null, memberships: [] });
  });

  it("hides the leads admin nav outside cloud mode", async () => {
    const user = await h.user("flags@example.com");
    const res = await h.call<Record<string, boolean>>("/api/v1/me/features", { token: user.token });
    expect(res.body.data["nav.leads_admin"]).toBe(false);
    expect(res.body.data["cockpit.performance"]).toBe(true);
  });

  it("records a login audit event", async () => {
    const user = await h.user("login@example.com");
    expect((await h.call("/api/v1/me/login", { method: "POST", token: user.token })).status).toBe(200);
    const { rows } = await h.testDb.pg.query("select 1 from audit_events where event_type = 'user.login'");
    expect(rows).toHaveLength(1);
  });
});
