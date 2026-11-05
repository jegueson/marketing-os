import { createMiddleware } from "hono/factory";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  isRole,
  roleHasPermission,
  type Permission,
  type Role,
} from "@marketing-os/core";
import { selectRows } from "@marketing-os/db";
import { run, userContext, type AppContext, type HonoEnv, type TenantAccess } from "../context";

type AccessRow = {
  tenant_id: string;
  membership_role: string | null;
  staff_role: string | null;
};

const uuid = z.string().uuid();

function decide(c: AppContext, row: AccessRow, workspaceId: string | null): TenantAccess {
  const principal = c.get("principal");
  if (row.membership_role && isRole(row.membership_role)) {
    return { tenantId: row.tenant_id, workspaceId, role: row.membership_role, via: "membership" };
  }
  // A staff assignment only counts while the token still carries a staff role.
  if (row.staff_role && isRole(row.staff_role) && principal.staffRole) {
    return { tenantId: row.tenant_id, workspaceId, role: row.staff_role, via: "staff_assignment" };
  }
  if (principal.staffRole === "platform_admin") {
    return { tenantId: row.tenant_id, workspaceId, role: "platform_admin", via: "platform_admin" };
  }
  throw new ForbiddenError("You do not have access to this workspace");
}

function assertPermission(role: Role, permission: Permission): void {
  if (!roleHasPermission(role, permission)) {
    throw new ForbiddenError(`Missing permission ${permission}`);
  }
}

function parseId(value: string | undefined, label: string): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw new ValidationError(`Invalid ${label}`);
  return parsed.data;
}

/** Resolves `:workspaceId` to a tenant and checks membership or staff assignment. */
export function requireWorkspace(permission: Permission) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const workspaceId = parseId(c.req.param("workspaceId"), "workspace id");
    const [row] = await run(c, userContext(c.get("principal")), (tx) =>
      selectRows<AccessRow>(tx, sql`select * from app.workspace_access(${workspaceId}::uuid)`),
    );
    if (!row) throw new NotFoundError("Workspace not found");
    const access = decide(c, row, workspaceId);
    assertPermission(access.role, permission);
    c.set("access", access);
    await next();
  });
}

/** Console routes on `:tenantId`: only assigned staff or a platform admin. */
export function requireAssignedTenant(permission: Permission) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const tenantId = parseId(c.req.param("tenantId"), "tenant id");
    if (!c.get("principal").staffRole) throw new ForbiddenError("Staff role required");
    const [row] = await run(c, userContext(c.get("principal")), (tx) =>
      selectRows<AccessRow>(tx, sql`select * from app.tenant_access(${tenantId}::uuid)`),
    );
    if (!row) throw new NotFoundError("Customer not found");
    const access = decide(c, { ...row, membership_role: null }, null);
    assertPermission(access.role, permission);
    c.set("access", access);
    await next();
  });
}
