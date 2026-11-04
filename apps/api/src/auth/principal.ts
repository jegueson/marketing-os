import { createMiddleware } from "hono/factory";
import { UnauthorizedError, ForbiddenError, type Permission, type Role, roleHasPermission } from "@marketing-os/core";
import type { HonoEnv } from "../app";

export type Principal = {
  userId: string;
  email: string;
  roles: Role[];
  tenantIds: string[];
  isStaff: boolean;
};

declare module "hono" {
  interface ContextVariableMap {
    principal: Principal;
  }
}

/** Dev/test principal from headers. Production JWT verification lands with Supabase JWKS. */
export const requirePrincipal = createMiddleware<HonoEnv>(async (c, next) => {
  const userId = c.req.header("x-user-id");
  const email = c.req.header("x-user-email") ?? "user@example.com";
  const roleHeader = c.req.header("x-user-role") ?? "customer_user";
  const tenantHeader = c.req.header("x-tenant-id");

  if (!userId) {
    throw new UnauthorizedError("Missing authentication");
  }

  const role = roleHeader as Role;
  const isStaff = ["platform_admin", "success_manager", "ai_specialist"].includes(role);
  const principal: Principal = {
    userId,
    email,
    roles: [role],
    tenantIds: tenantHeader ? [tenantHeader] : [],
    isStaff,
  };
  c.set("principal", principal);
  await next();
});

export function requirePermission(permission: Permission) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const principal = c.get("principal");
    const allowed = principal.roles.some((role) => roleHasPermission(role, permission));
    if (!allowed) {
      throw new ForbiddenError(`Missing permission ${permission}`);
    }
    await next();
  });
}
