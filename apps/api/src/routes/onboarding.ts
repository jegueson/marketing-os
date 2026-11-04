import { Hono } from "hono";
import { NotFoundError, ok } from "@marketing-os/core";
import type { HonoEnv } from "../app";
import { requirePermission, requirePrincipal } from "../auth/principal";
import { memoryStore } from "../store/memory";

export const onboardingRoutes = new Hono<HonoEnv>();

onboardingRoutes.get(
  "/api/v1/workspaces/:workspaceId/onboarding",
  requirePrincipal,
  requirePermission("onboarding:manage"),
  (c) => {
    const workspaceId = c.req.param("workspaceId");
    const items = memoryStore.checklists.get(workspaceId);
    if (!items) throw new NotFoundError("Onboarding not found");
    return c.json(ok({ workspaceId, items }));
  },
);

onboardingRoutes.get("/api/v1/tenants", requirePrincipal, requirePermission("tenants:read"), (c) => {
  const principal = c.get("principal");
  const items = [...memoryStore.tenants.values()].filter(
    (tenant) => principal.isStaff || principal.tenantIds.includes(tenant.id),
  );
  return c.json(ok(items));
});

onboardingRoutes.get("/api/v1/audit", requirePrincipal, requirePermission("audit:read"), (c) => {
  const principal = c.get("principal");
  const items = memoryStore.audit.filter(
    (event) =>
      principal.isStaff ||
      !event.tenantId ||
      principal.tenantIds.includes(event.tenantId),
  );
  return c.json(ok(items));
});
