import { createMiddleware } from "hono/factory";
import { sql } from "drizzle-orm";
import {
  ForbiddenError,
  UnauthorizedError,
  roleHasPermission,
  type Permission,
} from "@marketing-os/core";
import { profiles } from "@marketing-os/db";
import { run, staffRoles, userContext, type HonoEnv, type Principal, type StaffRole } from "../context";
import { verifySupabaseJwt } from "./jwt";

function readStaffRole(appMetadata: unknown): StaffRole | null {
  const value = (appMetadata as { mos_staff_role?: unknown } | undefined)?.mos_staff_role;
  return typeof value === "string" && (staffRoles as readonly string[]).includes(value)
    ? (value as StaffRole)
    : null;
}

/** Verifies the Supabase bearer token and mirrors the user into `profiles`. */
export const requirePrincipal = createMiddleware<HonoEnv>(async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    throw new UnauthorizedError("Missing authentication");
  }
  const config = c.get("config");
  const verified = await verifySupabaseJwt(token, {
    ...(config.supabaseJwksUrl ? { jwksUrl: config.supabaseJwksUrl } : {}),
    ...(config.supabaseJwtSecret ? { jwtSecret: config.supabaseJwtSecret } : {}),
    ...(config.supabaseUrl ? { issuer: `${config.supabaseUrl}/auth/v1` } : {}),
  });
  if (!verified.email) {
    throw new UnauthorizedError("Token missing email");
  }
  const principal: Principal = {
    userId: verified.userId,
    email: verified.email.toLowerCase(),
    staffRole: readStaffRole(verified.payload.app_metadata),
  };
  await run(c, userContext(principal), (tx) =>
    tx
      .insert(profiles)
      .values({ id: principal.userId, email: principal.email })
      .onConflictDoUpdate({
        target: profiles.id,
        set: { email: principal.email, updatedAt: sql`now()` },
        setWhere: sql`${profiles.email} <> ${principal.email}`,
      }),
  );
  c.set("principal", principal);
  await next();
});

/** Console routes: a staff role from the token that grants `permission`. */
export function requireStaff(permission: Permission) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const { staffRole } = c.get("principal");
    if (!staffRole) {
      throw new ForbiddenError("Staff role required");
    }
    if (!roleHasPermission(staffRole, permission)) {
      throw new ForbiddenError(`Missing permission ${permission}`);
    }
    await next();
  });
}
