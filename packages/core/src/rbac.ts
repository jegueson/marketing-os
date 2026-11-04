export const roles = [
  "platform_admin",
  "success_manager",
  "ai_specialist",
  "customer_admin",
  "customer_user",
] as const;

export type Role = (typeof roles)[number];

export const permissions = [
  "leads:read",
  "leads:write",
  "leads:convert",
  "tenants:provision",
  "tenants:read",
  "integrations:manage",
  "integrations:read",
  "cockpit:view",
  "audit:read",
  "onboarding:manage",
  "users:invite",
  "approvals:decide",
] as const;

export type Permission = (typeof permissions)[number];

const rolePermissionMatrix: Record<Role, readonly Permission[]> = {
  platform_admin: permissions,
  success_manager: [
    "leads:read",
    "leads:write",
    "leads:convert",
    "tenants:provision",
    "tenants:read",
    "integrations:read",
    "integrations:manage",
    "cockpit:view",
    "audit:read",
    "onboarding:manage",
    "users:invite",
  ],

  ai_specialist: [
    "leads:read",
    "tenants:read",
    "integrations:read",
    "integrations:manage",
    "cockpit:view",
    "audit:read",
    "onboarding:manage",
  ],
  customer_admin: [
    "integrations:manage",
    "integrations:read",
    "cockpit:view",
    "onboarding:manage",
    "users:invite",
    "approvals:decide",
  ],
  customer_user: ["integrations:read", "cockpit:view", "approvals:decide"],
};

export function permissionsForRole(role: Role): readonly Permission[] {
  return rolePermissionMatrix[role];
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return rolePermissionMatrix[role].includes(permission);
}

export function assertPermission(role: Role, permission: Permission): void {
  if (!roleHasPermission(role, permission)) {
    throw new Error(`Role ${role} lacks permission ${permission}`);
  }
}

export function isRole(value: string): value is Role {
  return (roles as readonly string[]).includes(value);
}

export function isPermission(value: string): value is Permission {
  return (permissions as readonly string[]).includes(value);
}
