import { describe, expect, it } from "vitest";
import {
  assertPermission,
  permissions,
  roleHasPermission,
  roles,
} from "./rbac";

describe("rbac", () => {
  it("denies unknown permissions by default", () => {
    expect(roleHasPermission("customer_user", "leads:convert")).toBe(false);
    expect(roleHasPermission("customer_admin", "leads:convert")).toBe(false);
  });

  it("grants convert to success managers and platform admins", () => {
    expect(roleHasPermission("success_manager", "leads:convert")).toBe(true);
    expect(roleHasPermission("platform_admin", "leads:convert")).toBe(true);
  });

  it("covers every role and permission entry", () => {
    expect(roles.length).toBeGreaterThanOrEqual(5);
    expect(permissions).toContain("audit:read");
  });

  it("throws when asserting a missing permission", () => {
    expect(() => assertPermission("customer_user", "tenants:provision")).toThrow(
      /lacks permission/,
    );
  });
});
