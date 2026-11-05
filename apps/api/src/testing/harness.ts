import { SignJWT } from "jose";
import { InMemoryEmailSender } from "@marketing-os/core";
import { createTestDatabase, type TestDatabase } from "@marketing-os/db/testing";
import { createApp } from "../app";
import type { AppDeps } from "../deps";
import type { StaffRole } from "../context";
import { DisabledCaptcha, MemoryRateLimiter } from "../lib/abuse";

const JWT_SECRET = "test-only-jwt-secret-at-least-32-bytes";

export type Envelope<T> = {
  success: boolean;
  data: T;
  error: { code: string; message: string; details?: unknown } | null;
  meta: Record<string, unknown> | null;
};

export type TestUser = { id: string; email: string; token: string };

export type Harness = {
  testDb: TestDatabase;
  emails: InMemoryEmailSender;
  env: Env;
  user(email: string, staffRole?: StaffRole): Promise<TestUser>;
  call<T>(path: string, init?: { method?: string; body?: unknown; token?: string }): Promise<{ status: number; body: Envelope<T> }>;
  close(): Promise<void>;
};

/**
 * API on a fresh PGlite database with every migration applied. Tokens are
 * HS256-signed with a test secret, like Supabase Auth with a shared secret.
 */
export async function createHarness(
  overrides: Partial<AppDeps> = {},
  mode: "self_hosted" | "cloud" = "self_hosted",
): Promise<Harness> {
  const testDb = await createTestDatabase();
  const emails = new InMemoryEmailSender();
  const app = createApp({
    openDatabase: () => ({ db: testDb.db, close: async () => {} }),
    emailSender: () => emails,
    leadRateLimiter: () => new MemoryRateLimiter(1000, 60_000),
    captcha: () => new DisabledCaptcha("ok"),
    ...overrides,
  });
  const env = {
    MOS_DEPLOYMENT_MODE: mode,
    APP_ORIGIN: "http://127.0.0.1:3000",
    DATABASE_URL: "pglite://memory",
    SUPABASE_JWT_SECRET: JWT_SECRET,
  } as Env;
  const secret = new TextEncoder().encode(JWT_SECRET);

  return {
    testDb,
    emails,
    env,
    async user(email, staffRole) {
      const id = await testDb.createUser(email);
      const token = await new SignJWT({
        email,
        app_metadata: staffRole ? { mos_staff_role: staffRole } : {},
      })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(id)
        .setAudience("authenticated")
        .setExpirationTime("10m")
        .sign(secret);
      return { id, email, token };
    },
    async call<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}) {
      const headers: Record<string, string> = {};
      if (init.body !== undefined) headers["content-type"] = "application/json";
      if (init.token) headers["authorization"] = `Bearer ${init.token}`;
      const res = await app.request(
        path,
        {
          method: init.method ?? "GET",
          headers,
          ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        },
        env,
      );
      return { status: res.status, body: (await res.json()) as Envelope<T> };
    },
    close: () => testDb.close(),
  };
}

export type ProvisionedCustomer = {
  leadId: string;
  tenantId: string;
  workspaceId: string;
  invitationId: string;
  admin: TestUser;
};

/** Public lead, qualified, converted, and the invite accepted by the contact. */
export async function provisionCustomer(
  h: Harness,
  staff: TestUser,
  company: string,
  email: string,
): Promise<ProvisionedCustomer> {
  const lead = await h.call<{ id: string }>("/api/v1/public/leads", {
    method: "POST",
    body: { companyName: company, contactName: "Contact", email, intent: "cloud_workspace" },
  });
  if (lead.status !== 201) throw new Error(`lead create failed: ${JSON.stringify(lead.body)}`);
  const leadId = lead.body.data.id;
  for (const status of ["contacted", "discovery", "qualified"]) {
    const moved = await h.call(`/api/v1/leads/${leadId}/status`, {
      method: "PATCH",
      body: { status },
      token: staff.token,
    });
    if (moved.status !== 200) throw new Error(`status ${status} failed: ${JSON.stringify(moved.body)}`);
  }
  const converted = await h.call<{
    tenant: { id: string };
    workspace: { id: string };
    invitation: { id: string };
  }>(`/api/v1/leads/${leadId}/convert`, { method: "POST", token: staff.token });
  if (converted.status !== 201) throw new Error(`convert failed: ${JSON.stringify(converted.body)}`);
  const admin = await h.user(email);
  const accepted = await h.call("/api/v1/invitations/accept", {
    method: "POST",
    body: { token: inviteTokenFrom(h.emails, email) },
    token: admin.token,
  });
  if (accepted.status !== 200) throw new Error(`accept failed: ${JSON.stringify(accepted.body)}`);
  return {
    leadId,
    tenantId: converted.body.data.tenant.id,
    workspaceId: converted.body.data.workspace.id,
    invitationId: converted.body.data.invitation.id,
    admin,
  };
}

/** Pulls the raw invite token out of the email body, as the invitee's browser would. */
export function inviteTokenFrom(emails: InMemoryEmailSender, to: string): string {
  const message = [...emails.sent].reverse().find((m) => m.to === to);
  const match = message?.text.match(/\/invite\/([a-f0-9]+)/);
  if (!match?.[1]) throw new Error(`No invitation email for ${to}`);
  return match[1];
}
