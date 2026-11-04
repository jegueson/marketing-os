import { Hono } from "hono";
import { z } from "zod";
import { NotFoundError, ValidationError, ok } from "@marketing-os/core";
import type { HonoEnv } from "../app";
import { requirePermission, requirePrincipal } from "../auth/principal";
import { memoryStore } from "../store/memory";

const catalog = [
  {
    slug: "mock",
    name: "Mock Marketing Data",
    category: "analytics",
    status: "active",
  },
  {
    slug: "google-analytics",
    name: "Google Analytics 4",
    category: "analytics",
    status: "coming_soon",
  },
  {
    slug: "google-ads",
    name: "Google Ads",
    category: "advertising",
    status: "coming_soon",
  },
  {
    slug: "meta",
    name: "Meta Ads",
    category: "advertising",
    status: "coming_soon",
  },
  {
    slug: "hubspot",
    name: "HubSpot",
    category: "crm",
    status: "coming_soon",
  },
  {
    slug: "linear",
    name: "Linear",
    category: "project",
    status: "coming_soon",
  },
  {
    slug: "notion",
    name: "Notion",
    category: "knowledge",
    status: "coming_soon",
  },
];

export const integrationsRoutes = new Hono<HonoEnv>();

integrationsRoutes.use("/api/v1/integrations/*", requirePrincipal);
integrationsRoutes.use("/api/v1/integrations", requirePrincipal);
integrationsRoutes.use("/api/v1/connections/*", requirePrincipal);
integrationsRoutes.use("/api/v1/connections", requirePrincipal);

integrationsRoutes.get("/api/v1/integrations", requirePermission("integrations:read"), (c) =>
  c.json(ok(catalog)),
);

integrationsRoutes.post("/api/v1/connections", requirePermission("integrations:manage"), async (c) => {
  const body = z
    .object({
      workspaceId: z.string().uuid(),
      connectorSlug: z.string(),
      displayName: z.string().min(1),
      scopes: z.array(z.string()).default([]),
    })
    .safeParse(await c.req.json());
  if (!body.success) throw new ValidationError("Invalid connection", body.error.flatten());
  if (body.data.connectorSlug !== "mock") {
    throw new ValidationError("Only the mock connector is available in Sprint 1");
  }
  if (body.data.scopes.length === 0) {
    throw new ValidationError("Select at least one data scope");
  }

  const principal = c.get("principal");
  const tenantId = principal.tenantIds[0] ?? crypto.randomUUID();
  const connection = {
    id: crypto.randomUUID(),
    tenantId,
    workspaceId: body.data.workspaceId,
    connectorSlug: body.data.connectorSlug,
    displayName: body.data.displayName,
    status: "active" as const,
    scopes: body.data.scopes,
  };
  memoryStore.connections.set(connection.id, connection);
  memoryStore.recordAudit("integration.connected", { connectionId: connection.id }, tenantId);

  const checklist = memoryStore.checklists.get(body.data.workspaceId);
  if (checklist) {
    const item = checklist.find((entry) => entry.key === "connect_source");
    if (item) item.status = "completed";
  }

  return c.json(ok(connection), 201);
});

integrationsRoutes.post(
  "/api/v1/connections/:id/test",
  requirePermission("integrations:manage"),
  (c) => {
    const connection = memoryStore.connections.get(c.req.param("id"));
    if (!connection) throw new NotFoundError("Connection not found");
    return c.json(ok({ connectionId: connection.id, healthy: true, checkedAt: new Date().toISOString() }));
  },
);

integrationsRoutes.get("/api/v1/connections", requirePermission("integrations:read"), (c) => {
  const principal = c.get("principal");
  const items = [...memoryStore.connections.values()].filter(
    (connection) =>
      principal.isStaff ||
      principal.tenantIds.length === 0 ||
      principal.tenantIds.includes(connection.tenantId),
  );
  return c.json(ok(items));
});
