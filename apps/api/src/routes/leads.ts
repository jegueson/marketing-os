import { Hono } from "hono";
import { z } from "zod";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  assertLeadTransition,
  ok,
  type LeadStatus,
} from "@marketing-os/core";
import type { HonoEnv } from "../app";
import { requirePermission, requirePrincipal } from "../auth/principal";
import { memoryStore } from "../store/memory";

export const leadsRoutes = new Hono<HonoEnv>();

leadsRoutes.use("/api/v1/leads/*", requirePrincipal);
leadsRoutes.use("/api/v1/leads", requirePrincipal);

leadsRoutes.get("/api/v1/leads", requirePermission("leads:read"), (c) => {
  const status = c.req.query("status");
  const page = Number(c.req.query("page") ?? "1");
  const limit = Math.min(Number(c.req.query("limit") ?? "20"), 100);
  let items = [...memoryStore.leads.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  if (status) {
    items = items.filter((lead) => lead.status === status);
  }
  const total = items.length;
  const slice = items.slice((page - 1) * limit, page * limit);
  return c.json(ok(slice, { total, page, limit }));
});

leadsRoutes.get("/api/v1/leads/:id", requirePermission("leads:read"), (c) => {
  const lead = memoryStore.leads.get(c.req.param("id"));
  if (!lead) throw new NotFoundError("Lead not found");
  return c.json(ok(lead));
});

leadsRoutes.patch("/api/v1/leads/:id/status", requirePermission("leads:write"), async (c) => {
  const lead = memoryStore.leads.get(c.req.param("id"));
  if (!lead) throw new NotFoundError("Lead not found");
  const body = z.object({ status: z.string() }).safeParse(await c.req.json());
  if (!body.success) throw new ValidationError("Invalid status");
  const next = body.data.status as LeadStatus;
  try {
    assertLeadTransition(lead.status, next);
  } catch {
    throw new ConflictError(`Cannot transition from ${lead.status} to ${next}`);
  }
  lead.status = next;
  memoryStore.leads.set(lead.id, lead);
  memoryStore.recordAudit("lead.status_changed", { leadId: lead.id, status: next });
  return c.json(ok(lead));
});

leadsRoutes.post("/api/v1/leads/:id/notes", requirePermission("leads:write"), async (c) => {
  const lead = memoryStore.leads.get(c.req.param("id"));
  if (!lead) throw new NotFoundError("Lead not found");
  const body = z.object({ body: z.string().min(1) }).safeParse(await c.req.json());
  if (!body.success) throw new ValidationError("Invalid note");
  const note = {
    id: crypto.randomUUID(),
    leadId: lead.id,
    body: body.data.body,
    createdAt: new Date().toISOString(),
  };
  const list = memoryStore.notes.get(lead.id) ?? [];
  list.push(note);
  memoryStore.notes.set(lead.id, list);
  return c.json(ok(note), 201);
});

leadsRoutes.post("/api/v1/leads/:id/convert", requirePermission("leads:convert"), async (c) => {
  const lead = memoryStore.leads.get(c.req.param("id"));
  if (!lead) throw new NotFoundError("Lead not found");
  if (lead.status === "converted") {
    throw new ConflictError("Lead already converted");
  }
  if (lead.status !== "qualified") {
    throw new ConflictError("Lead must be qualified before conversion");
  }

  const tenantId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const invitationId = crypto.randomUUID();
  const token = crypto.randomUUID();
  const tokenHash = await hashToken(token);

  const tenant = {
    id: tenantId,
    slug: slugify(lead.companyName),
    name: lead.companyName,
  };
  const workspace = {
    id: workspaceId,
    tenantId,
    slug: "default",
    name: "Default",
  };
  const invitation = {
    id: invitationId,
    tenantId,
    email: lead.email,
    role: "customer_admin" as const,
    tokenHash,
    status: "pending" as const,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };

  memoryStore.tenants.set(tenantId, tenant);
  memoryStore.workspaces.set(workspaceId, workspace);
  memoryStore.invitations.set(invitationId, invitation);
  memoryStore.checklists.set(workspaceId, [
    { key: "connect_source", title: "Connect a data source", status: "pending" },
    { key: "review_cockpit", title: "Open the cockpit", status: "pending" },
  ]);
  lead.status = "converted";
  lead.convertedTenantId = tenantId;
  memoryStore.leads.set(lead.id, lead);
  memoryStore.recordAudit("customer.provisioned", { tenantId, leadId: lead.id }, tenantId);

  return c.json(
    ok({
      tenant,
      workspace,
      invitation: { id: invitationId, email: lead.email, token },
    }),
    201,
  );
});

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "tenant"
  );
}
