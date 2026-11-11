import { z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { NotFoundError, ValidationError, AppError, ok } from "@marketing-os/core";
import { connections, connectors } from "@marketing-os/db";
import { requireWorkspace } from "../auth/access";
import { run, tenantContext, type AppContext } from "../context";
import { keyRingFromConfig, loadConnectionCredentials } from "../lib/credentials";
import { parseUuidParam } from "../lib/http";
import { beginOAuth, completeOAuth, portalRedirect, refreshOAuth } from "../lib/oauth";
import {
  apiSuccessSchema,
  createRouter,
  defineRoute,
  errorResponses,
  jsonContent,
  uuidPathParam,
} from "../lib/openapi";

export const oauthRoutes = createRouter();

const security = [{ Bearer: [] }];
const connectionParams = z.object({
  workspaceId: uuidPathParam("workspaceId"),
  id: uuidPathParam("id"),
});

const startRoute = defineRoute({
  method: "post",
  path: "/api/v1/workspaces/{workspaceId}/connections/{id}/oauth/start",
  tags: ["Integrations"],
  security,
  middleware: [requireWorkspace("integrations:manage")],
  request: { params: connectionParams },
  responses: {
    200: jsonContent(
      apiSuccessSchema(z.object({ authorizationUrl: z.string().url() }).openapi("OAuthStart"), "OAuthStartResponse"),
      "Authorization URL",
    ),
    ...errorResponses(401, 403, 404, 422, 503),
  },
});

const refreshRoute = defineRoute({
  method: "post",
  path: "/api/v1/workspaces/{workspaceId}/connections/{id}/oauth/refresh",
  tags: ["Integrations"],
  security,
  middleware: [requireWorkspace("integrations:manage")],
  request: { params: connectionParams },
  responses: {
    200: jsonContent(
      apiSuccessSchema(z.object({ refreshed: z.literal(true) }).openapi("OAuthRefresh"), "OAuthRefreshResponse"),
      "Token refreshed",
    ),
    ...errorResponses(401, 403, 404, 409, 422, 503),
  },
});

const callbackRoute = defineRoute({
  method: "get",
  path: "/api/v1/integrations/oauth/callback",
  tags: ["Integrations"],
  request: {
    query: z.object({
      code: z.string().optional(),
      state: z.string().optional(),
      error: z.string().optional(),
    }),
  },
  responses: {
    302: { description: "Redirect to the portal. Tokens are not in the URL." },
    ...errorResponses(409, 422, 503),
  },
});

function callbackUrl(c: AppContext): string {
  return new URL("/api/v1/integrations/oauth/callback", c.req.url).toString();
}

async function providerFor(c: AppContext, slug: string) {
  const provider = c.get("deps").oauthProviders.get(slug);
  if (!provider) throw new ValidationError(`Connector ${slug} does not support OAuth`);
  return provider;
}

async function requireRing(c: AppContext) {
  const ring = await keyRingFromConfig(c.get("config"));
  if (!ring) throw new ValidationError("Credential encryption is not configured");
  return ring;
}

oauthRoutes.openapi(startRoute, async (c) => {
  const workspaceId = parseUuidParam(c, "workspaceId");
  const id = parseUuidParam(c, "id");
  const access = c.get("access");
  const started = await run(c, tenantContext(c), async (tx) => {
    const [connection] = await tx
      .select({ id: connections.id, slug: connectors.slug })
      .from(connections)
      .innerJoin(connectors, eq(connectors.id, connections.connectorId))
      .where(eq(connections.id, id));
    if (!connection) throw new NotFoundError("Connection not found");
    return beginOAuth(tx, {
      tenantId: access.tenantId,
      workspaceId,
      connectionId: id,
      connectorSlug: connection.slug,
      redirectUri: callbackUrl(c),
      provider: await providerFor(c, connection.slug),
    });
  });
  return c.json(ok(started), 200);
});

oauthRoutes.openapi(refreshRoute, async (c) => {
  const workspaceId = parseUuidParam(c, "workspaceId");
  const id = parseUuidParam(c, "id");
  const access = c.get("access");
  const ring = await requireRing(c);
  const result = await run(c, tenantContext(c), async (tx) => {
    const [connection] = await tx
      .select({ id: connections.id, slug: connectors.slug })
      .from(connections)
      .innerJoin(connectors, eq(connectors.id, connections.connectorId))
      .where(eq(connections.id, id));
    if (!connection) throw new NotFoundError("Connection not found");
    const credentials = await loadConnectionCredentials(tx, id, ring);
    if (!credentials.refresh_token) throw new ValidationError("Reconnect the provider to grant access again");
    return refreshOAuth(tx, {
      connectionId: id,
      tenantId: access.tenantId,
      workspaceId,
      provider: await providerFor(c, connection.slug),
      ring,
      refreshToken: credentials.refresh_token,
      actorId: c.get("principal").userId,
      actorRole: access.role,
      requestId: c.get("requestId"),
    });
  });
  if (!result.refreshed) throw new AppError(result.code, result.message, result.httpStatus);
  return c.json(ok(result), 200);
});

oauthRoutes.openapi(callbackRoute, async (c) => {
  const appOrigin = c.get("config").appOrigin;
  const query = c.req.valid("query");
  if (query.error || !query.code || !query.state) {
    return c.redirect(portalRedirect(appOrigin, "error"), 302);
  }
  const ring = await requireRing(c);
  const done = await completeOAuth(c.get("db")(), {
    state: query.state,
    code: query.code,
    providerForSlug: (slug) => {
      const provider = c.get("deps").oauthProviders.get(slug);
      if (!provider) throw new ValidationError(`Connector ${slug} does not support OAuth`);
      return provider;
    },
    ring,
    appOrigin,
  });
  const location = done.redirectTo;
  if (location.includes("refresh_token") || location.includes("rt-secret")) {
    throw new ValidationError("Refusing to redirect with a token");
  }
  return c.redirect(location, 302);
});
