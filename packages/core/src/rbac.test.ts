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
    expect(permissions).toEqual(
      expect.arrayContaining(["ask:use", "models:manage", "usage:read"]),
    );
  });

  it("throws when asserting a missing permission", () => {
    expect(() => assertPermission("customer_user", "tenants:provision")).toThrow(
      /lacks permission/,
    );
  });

  it("grants ask:use to customers and platform admin, not support staff", () => {
    expect(roleHasPermission("customer_admin", "ask:use")).toBe(true);
    expect(roleHasPermission("customer_user", "ask:use")).toBe(true);
    expect(roleHasPermission("platform_admin", "ask:use")).toBe(true);
    expect(roleHasPermission("success_manager", "ask:use")).toBe(false);
    expect(roleHasPermission("ai_specialist", "ask:use")).toBe(false);
  });

  it("grants models:manage only to customer_admin and platform_admin", () => {
    expect(roleHasPermission("customer_admin", "models:manage")).toBe(true);
    expect(roleHasPermission("platform_admin", "models:manage")).toBe(true);
    expect(roleHasPermission("customer_user", "models:manage")).toBe(false);
    expect(roleHasPermission("success_manager", "models:manage")).toBe(false);
    expect(roleHasPermission("ai_specialist", "models:manage")).toBe(false);
  });

  it("grants usage:read to admins, SM, and specialists", () => {
    expect(roleHasPermission("customer_admin", "usage:read")).toBe(true);
    expect(roleHasPermission("success_manager", "usage:read")).toBe(true);
    expect(roleHasPermission("ai_specialist", "usage:read")).toBe(true);
    expect(roleHasPermission("platform_admin", "usage:read")).toBe(true);
    expect(roleHasPermission("customer_user", "usage:read")).toBe(false);
  });

  it("lets a specialist write config and a customer admin only read it", () => {
    expect(roleHasPermission("ai_specialist", "config:write")).toBe(true);
    expect(roleHasPermission("ai_specialist", "config:read")).toBe(true);
    expect(roleHasPermission("platform_admin", "config:write")).toBe(true);
    expect(roleHasPermission("platform_admin", "config:read")).toBe(true);
    expect(roleHasPermission("customer_admin", "config:read")).toBe(true);
    expect(roleHasPermission("customer_admin", "config:write")).toBe(false);
    expect(roleHasPermission("success_manager", "config:read")).toBe(true);
    expect(roleHasPermission("success_manager", "config:write")).toBe(false);
    expect(roleHasPermission("customer_user", "config:read")).toBe(false);
    expect(roleHasPermission("customer_user", "config:write")).toBe(false);
  });
});
