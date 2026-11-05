import { Hono } from "hono";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  fail,
  formatLogLine,
  ok,
} from "@marketing-os/core";
import type { Connector, ConnectorContext } from "@marketing-os/connector-sdk";
import { connectionCreateSchema, scopeSelectionSchema } from "@marketing-os/schemas";
import {
  connections,
  connectors,
  dataHealth,
  dataScopes,
  featureFlags,
  type Database,
} from "@marketing-os/db";
import { requirePrincipal } from "../auth/principal";
import { requireWorkspace } from "../auth/access";
import { run, tenantContext, type AppContext, type HonoEnv } from "../context";
import { enqueueEvent, recordAudit } from "../lib/events";
import { parseBody, parseUuidParam } from "../lib/http";

/** Shown in the catalog until a real connector ships behind its `connector.<slug>` flag. */
const comingSoon = [
  { slug: "google-analytics", name: "Google Analytics 4", category: "analytics" },
  { slug: "google-ads", name: "Google Ads", category: "advertising" },
  { slug: "meta", name: "Meta Ads", category: "advertising" },
  { slug: "hubspot", name: "HubSpot", category: "crm" },
  { slug: "linear", name: "Linear", category: "project" },
  { slug: "notion", name: "Notion", category: "knowledge" },
] as const;

const base = "/api/v1/workspaces/:workspaceId";

export const integrationsRoutes = new Hono<HonoEnv>();

integrationsRoutes.use(`${base}/integrations`, requirePrincipal);
integrationsRoutes.use(`${base}/connections`, requirePrincipal);
integrationsRoutes.use(`${base}/connections/*`, requirePrincipal);

function connectorFor(c: AppContext, slug: string): Connector {
  const connector = c.get("deps").connectors.get(slug);
  if (!connector) throw new ValidationError(`Connector ${slug} is not available`);
  return connector;
}

type LoadedConnection = {
  id: string;
  tenantId: string;
  workspaceId: string;
  displayName: string;
  status: string;
  slug: string;
};

async function loadConnection(tx: Database, workspaceId: string, id: string): Promise<LoadedConnection> {
  const [row] = await tx
    .select({
      id: connections.id,
      tenantId: connections.tenantId,
      workspaceId: connections.workspaceId,
      displayName: connections.displayName,
      status: connections.status,
      slug: connectors.slug,
    })
    .from(connections)
    .innerJoin(connectors, eq(connectors.id, connections.connectorId))
    .where(and(eq(connections.id, id), eq(connections.workspaceId, workspaceId), isNull(connections.deletedAt)));
  if (!row) throw new NotFoundError("Connection not found");
  return row;
}

function connectorContext(connection: LoadedConnection): ConnectorContext {
  return {
    tenantId: connection.tenantId,
    workspaceId: connection.workspaceId,
    connectionId: connection.id,
    credentials: {},
  };
}

function auditBase(c: AppContext) {
  const access = c.get("access");
  return {
    tenantId: access.tenantId,
    workspaceId: access.workspaceId,
    actorId: c.get("principal").userId,
    actorRole: access.role,
    requestId: c.get("requestId"),
  };
}

integrationsRoutes.get(`${base}/integrations`, requireWorkspace("integrations:read"), async (c) => {
  const { rows, flags } = await run(c, tenantContext(c), async (tx) => ({
    rows: await tx.select().from(connectors).where(eq(connectors.status, "active")),
    flags: await tx.select({ key: featureFlags.key, isEnabled: featureFlags.isEnabled }).from(featureFlags),
  }));
  const registry = c.get("deps").connectors;
  const available = rows
    .filter((row) => registry.has(row.slug))
    .map((row) => ({ slug: row.slug, name: row.name, category: row.category, status: "available" as const }));
  const flagged = new Map(flags.map((flag) => [flag.key, flag.isEnabled]));
  const upcoming = comingSoon
    .filter((entry) => !available.some((a) => a.slug === entry.slug))
    .map((entry) => ({
      ...entry,
      status: flagged.get(`connector.${entry.slug}`) ? ("beta" as const) : ("coming_soon" as const),
    }));
  return c.json(ok([...available, ...upcoming]));
});

integrationsRoutes.get(`${base}/connections`, requireWorkspace("integrations:read"), async (c) => {
  const workspaceId = parseUuidParam(c, "workspaceId");
  const items = await run(c, tenantContext(c), (tx) =>
    tx
      .select({
        id: connections.id,
        connector: connectors.slug,
        displayName: connections.displayName,
        status: connections.status,
        errorMessage: connections.errorMessage,
        lastHealthyAt: connections.lastHealthyAt,
        scopes: sql<number>`(select count(*)::int from data_scopes s where s.connection_id = ${connections.id} and s.is_active)`,
      })
      .from(connections)
      .innerJoin(connectors, eq(connectors.id, connections.connectorId))
      .where(and(eq(connections.workspaceId, workspaceId), isNull(connections.deletedAt))),
  );
  return c.json(ok(items));
});

integrationsRoutes.post(`${base}/connections`, requireWorkspace("integrations:manage"), async (c) => {
  const workspaceId = parseUuidParam(c, "workspaceId");
  const input = await parseBody(c, connectionCreateSchema);
  connectorFor(c, input.connectorSlug);
  const created = await run(c, tenantContext(c), async (tx) => {
    const [connector] = await tx
      .select({ id: connectors.id })
      .from(connectors)
      .where(and(eq(connectors.slug, input.connectorSlug), eq(connectors.status, "active")));
    if (!connector) throw new ValidationError(`Connector ${input.connectorSlug} is not available`);
    const [row] = await tx
      .insert(connections)
      .values({
        tenantId: c.get("access").tenantId,
        workspaceId,
        connectorId: connector.id,
        displayName: input.displayName,
        createdBy: c.get("principal").userId,
      })
      .returning();
    if (!row) throw new Error("Connection insert returned no row");
    await recordAudit(tx, {
      ...auditBase(c),
      eventType: "integration.created",
      resourceType: "connection",
      resourceId: row.id,
      payload: { connector: input.connectorSlug },
    });
    return row;
  });
  return c.json(ok({ ...created, connector: input.connectorSlug, scopes: 0 }), 201);
});

integrationsRoutes.get(
  `${base}/connections/:id/resources`,
  requireWorkspace("integrations:read"),
  async (c) => {
    const workspaceId = parseUuidParam(c, "workspaceId");
    const id = parseUuidParam(c, "id");
    const { connection, selected } = await run(c, tenantContext(c), async (tx) => ({
      connection: await loadConnection(tx, workspaceId, id),
      selected: await tx
        .select({ resourceType: dataScopes.resourceType, resourceId: dataScopes.resourceId })
        .from(dataScopes)
        .where(and(eq(dataScopes.connectionId, id), eq(dataScopes.isActive, true))),
    }));
    const resources = await connectorFor(c, connection.slug).listResources(connectorContext(connection));
    const chosen = new Set(selected.map((s) => `${s.resourceType}:${s.resourceId}`));
    return c.json(
      ok(
        resources.map((r) => ({
          resourceType: r.kind,
          resourceId: r.name,
          resourceName: r.description ?? r.name,
          selected: chosen.has(`${r.kind}:${r.name}`),
        })),
      ),
    );
  },
);

integrationsRoutes.put(
  `${base}/connections/:id/scopes`,
  requireWorkspace("integrations:manage"),
  async (c) => {
    const workspaceId = parseUuidParam(c, "workspaceId");
    const id = parseUuidParam(c, "id");
    const input = await parseBody(c, scopeSelectionSchema);
    const access = c.get("access");
    const result = await run(c, tenantContext(c), async (tx) => {
      const connection = await loadConnection(tx, workspaceId, id);
      const offered = await connectorFor(c, connection.slug).listResources(connectorContext(connection));
      const offeredKeys = new Set(offered.map((r) => `${r.kind}:${r.name}`));
      const unknown = input.resources.filter((r) => !offeredKeys.has(`${r.resourceType}:${r.resourceId}`));
      if (unknown.length) {
        throw new ValidationError("Unknown resources for this connector", { unknown });
      }
      await tx.update(dataScopes).set({ isActive: false }).where(eq(dataScopes.connectionId, id));
      for (const resource of input.resources) {
        await tx
          .insert(dataScopes)
          .values({
            connectionId: id,
            tenantId: access.tenantId,
            resourceType: resource.resourceType,
            resourceId: resource.resourceId,
            resourceName: resource.resourceName ?? null,
            approvedBy: c.get("principal").userId,
          })
          .onConflictDoUpdate({
            target: [dataScopes.connectionId, dataScopes.resourceType, dataScopes.resourceId],
            set: { isActive: true, approvedAt: sql`now()`, approvedBy: c.get("principal").userId },
          });
      }
      await recordAudit(tx, {
        ...auditBase(c),
        eventType: "integration.scopes_changed",
        resourceType: "connection",
        resourceId: id,
        payload: { resources: input.resources.map((r) => `${r.resourceType}:${r.resourceId}`) },
      });
      return { connectionId: id, scopes: input.resources.length };
    });
    return c.json(ok(result));
  },
);

type TestOutcome =
  | { healthy: true; checkedAt: string }
  | { healthy: false; code: "no_scopes_selected" | "connector_unhealthy" | "connector_error"; message: string };

integrationsRoutes.post(
  `${base}/connections/:id/test`,
  requireWorkspace("integrations:manage"),
  async (c) => {
    const workspaceId = parseUuidParam(c, "workspaceId");
    const id = parseUuidParam(c, "id");
    const outcome = await run(c, tenantContext(c), async (tx): Promise<TestOutcome> => {
      const connection = await loadConnection(tx, workspaceId, id);
      const [scopeCount] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(dataScopes)
        .where(and(eq(dataScopes.connectionId, id), eq(dataScopes.isActive, true)));
      let result: TestOutcome;
      if (!scopeCount?.n) {
        result = {
          healthy: false,
          code: "no_scopes_selected",
          message: "Select at least one account or resource before testing the connection.",
        };
      } else {
        try {
          const health = await connectorFor(c, connection.slug).health(connectorContext(connection));
          result =
            health.status === "error"
              ? {
                  healthy: false,
                  code: "connector_unhealthy",
                  message: health.message ?? "The provider reported an error. Check access and retry.",
                }
              : { healthy: true, checkedAt: health.checkedAt };
        } catch (err) {
          console.error(
            formatLogLine({
              level: "error",
              message: "connector health check failed",
              requestId: c.get("requestId"),
              tenantId: connection.tenantId,
              connectionId: id,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
          result = { healthy: false, code: "connector_error", message: "Could not reach the provider. Retry later." };
        }
      }
      await recordConnectionHealth(tx, c, connection, result);
      return result;
    });
    if (!outcome.healthy) {
      return c.json(fail(outcome.code, outcome.message), 422);
    }
    return c.json(ok({ connectionId: id, ...outcome }));
  },
);

async function recordConnectionHealth(
  tx: Database,
  c: AppContext,
  connection: LoadedConnection,
  result: TestOutcome,
): Promise<void> {
  const now = new Date();
  if (result.healthy || result.code !== "no_scopes_selected") {
    await tx
      .update(connections)
      .set(
        result.healthy
          ? { status: "active", errorMessage: null, lastHealthyAt: now, updatedAt: now }
          : { status: "error", errorMessage: result.message, updatedAt: now },
      )
      .where(eq(connections.id, connection.id));
    await tx.insert(dataHealth).values({
      connectionId: connection.id,
      tenantId: connection.tenantId,
      status: result.healthy ? "healthy" : "error",
      freshnessAt: result.healthy ? now : null,
      issues: result.healthy ? [] : [{ code: result.code, message: result.message }],
      checkedAt: now,
    });
  }
  const eventType = result.healthy ? "integration.connected" : "integration.failed";
  await enqueueEvent(tx, eventType, connection.tenantId, {
    connectionId: connection.id,
    workspaceId: connection.workspaceId,
    connector: connection.slug,
    ...(result.healthy ? {} : { code: result.code }),
  });
  await recordAudit(tx, {
    ...auditBase(c),
    eventType,
    resourceType: "connection",
    resourceId: connection.id,
    payload: result.healthy ? {} : { code: result.code },
  });
}

integrationsRoutes.delete(
  `${base}/connections/:id`,
  requireWorkspace("integrations:manage"),
  async (c) => {
    const workspaceId = parseUuidParam(c, "workspaceId");
    const id = parseUuidParam(c, "id");
    await run(c, tenantContext(c), async (tx) => {
      const connection = await loadConnection(tx, workspaceId, id);
      if (connection.status === "disconnected") throw new ConflictError("Connection already removed");
      const now = new Date();
      await tx
        .update(connections)
        .set({ status: "disconnected", deletedAt: now, updatedAt: now })
        .where(eq(connections.id, id));
      await tx.update(dataScopes).set({ isActive: false }).where(eq(dataScopes.connectionId, id));
      await recordAudit(tx, {
        ...auditBase(c),
        eventType: "integration.deleted",
        resourceType: "connection",
        resourceId: id,
      });
    });
    return c.json(ok({ connectionId: id, deleted: true }));
  },
);
