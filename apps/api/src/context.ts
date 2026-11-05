import type { Context } from "hono";
import type { Role } from "@marketing-os/core";
import { withContext, type Database, type DbContext } from "@marketing-os/db";
import type { AppDeps } from "./deps";
import type { AppEnv } from "./env";

export const staffRoles = ["platform_admin", "success_manager", "ai_specialist"] as const;
export type StaffRole = (typeof staffRoles)[number];

export type Principal = {
  userId: string;
  email: string;
  /** From Supabase `app_metadata.mos_staff_role`, which only the service role can set. */
  staffRole: StaffRole | null;
};

/** The caller's standing inside one tenant, resolved from the database. */
export type TenantAccess = {
  tenantId: string;
  workspaceId: string | null;
  role: Role;
  via: "membership" | "staff_assignment" | "platform_admin";
};

export type HonoEnv = {
  Bindings: Env;
  Variables: {
    requestId: string;
    config: AppEnv;
    deps: AppDeps;
    db: () => Database;
    principal: Principal;
    access: TenantAccess;
  };
};

export type AppContext = Context<HonoEnv>;

export function run<T>(c: AppContext, ctx: DbContext, fn: (tx: Database) => Promise<T>): Promise<T> {
  return withContext(c.get("db")(), ctx, fn);
}

/** Platform writes with no user (public lead form, outbox relay). */
export const systemContext: DbContext = { tenantId: null, userId: null, staff: true };

export function staffContext(principal: Principal): DbContext {
  return { tenantId: null, userId: principal.userId, staff: true };
}

export function userContext(principal: Principal): DbContext {
  return { tenantId: null, userId: principal.userId, staff: false };
}

export function tenantContext(c: AppContext): DbContext {
  return { tenantId: c.get("access").tenantId, userId: c.get("principal").userId, staff: false };
}

export function clientIp(c: AppContext): string | null {
  return c.req.header("cf-connecting-ip") ?? null;
}
