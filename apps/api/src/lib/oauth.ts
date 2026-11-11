import { eq, sql } from "drizzle-orm";
import {
  AppError,
  ConflictError,
  ValidationError,
  buildAuthorizationUrl,
  createPkcePair,
  type KeyRing,
} from "@marketing-os/core";
import { ConnectorError } from "@marketing-os/connector-sdk";
import { connections, oauthStates, type Database } from "@marketing-os/db";
import { enqueueEvent, recordAudit } from "./events";
import { saveConnectionCredentials } from "./credentials";
import type { OAuthProvider, OAuthTokenSet } from "./mock-oauth";

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const AUTH_FAILURES = new Set(["auth_expired", "access_revoked", "permission_changed", "api_version_error"]);

export function portalRedirect(appOrigin: string, result: "connected" | "error", connectionId?: string): string {
  const url = new URL("/portal/integrations", appOrigin);
  url.searchParams.set("oauth", result);
  if (connectionId) url.searchParams.set("connection", connectionId);
  return url.toString();
}

export async function beginOAuth(
  tx: Database,
  input: {
    tenantId: string;
    workspaceId: string;
    connectionId: string;
    connectorSlug: string;
    redirectUri: string;
    provider: OAuthProvider;
    now?: Date;
  },
): Promise<{ authorizationUrl: string }> {
  const now = input.now ?? new Date();
  const pair = await createPkcePair();
  await tx.insert(oauthStates).values({
    state: pair.state,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    connectionId: input.connectionId,
    connectorSlug: input.connectorSlug,
    codeVerifier: pair.codeVerifier,
    redirectUri: input.redirectUri,
    expiresAt: new Date(now.getTime() + OAUTH_STATE_TTL_MS),
  });
  return {
    authorizationUrl: buildAuthorizationUrl({
      authorizationUrl: input.provider.authorizationUrl,
      clientId: input.provider.clientId,
      redirectUri: input.redirectUri,
      scope: input.provider.scopes,
      state: pair.state,
      codeChallenge: pair.codeChallenge,
    }),
  };
}

async function consumeState(tx: Database, state: string, now: Date) {
  await tx.execute(sql`select set_config('app.oauth_state', ${state}, true)`);
  const [row] = await tx.select().from(oauthStates).where(eq(oauthStates.state, state));
  if (!row) throw new ValidationError("Unknown OAuth state");
  if (row.consumedAt) throw new ConflictError("OAuth state already used");
  if (new Date(row.expiresAt).getTime() <= now.getTime()) throw new ValidationError("OAuth state expired");
  await tx.update(oauthStates).set({ consumedAt: now }).where(eq(oauthStates.state, state));
  await tx.execute(sql`
    select
      set_config('app.tenant_id', ${row.tenantId}, true),
      set_config('app.user_id', '', true),
      set_config('app.staff', 'off', true)
  `);
  return row;
}

export async function completeOAuth(
  db: Database,
  input: {
    state: string;
    code: string;
    providerForSlug: (slug: string) => OAuthProvider;
    ring: KeyRing;
    appOrigin: string;
    now?: Date;
  },
): Promise<{ redirectTo: string }> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role app_api`);
    const row = await consumeState(tx, input.state, now);
    let tokens: OAuthTokenSet;
    try {
      tokens = await input.providerForSlug(row.connectorSlug).exchangeCode({
        code: input.code,
        codeVerifier: row.codeVerifier,
        redirectUri: row.redirectUri,
      });
    } catch (err) {
      throw oauthError(err);
    }
    await saveConnectionCredentials(tx, {
      connectionId: row.connectionId,
      tenantId: row.tenantId,
      ring: input.ring,
      credentials: { access_token: tokens.accessToken, refresh_token: tokens.refreshToken },
    });
    await tx
      .update(connections)
      .set({ status: "active", errorMessage: null, updatedAt: now })
      .where(eq(connections.id, row.connectionId));
    await recordAudit(tx, {
      eventType: "integration.oauth_connected",
      tenantId: row.tenantId,
      workspaceId: row.workspaceId,
      resourceType: "connection",
      resourceId: row.connectionId,
      payload: { connector: row.connectorSlug },
    });
    return { redirectTo: portalRedirect(input.appOrigin, "connected", row.connectionId) };
  });
}

export async function refreshOAuth(
  tx: Database,
  input: {
    connectionId: string;
    tenantId: string;
    workspaceId: string;
    provider: OAuthProvider;
    ring: KeyRing;
    refreshToken: string;
    actorId: string;
    actorRole: string;
    requestId: string;
  },
): Promise<{ refreshed: true } | { refreshed: false; code: string; message: string; httpStatus: number }> {
  try {
    const tokens = await input.provider.refresh(input.refreshToken);
    await saveConnectionCredentials(tx, {
      connectionId: input.connectionId,
      tenantId: input.tenantId,
      ring: input.ring,
      credentials: { access_token: tokens.accessToken, refresh_token: tokens.refreshToken },
    });
    await tx
      .update(connections)
      .set({ status: "active", errorMessage: null, updatedAt: new Date() })
      .where(eq(connections.id, input.connectionId));
    await recordAudit(tx, {
      eventType: "integration.oauth_refreshed",
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      resourceType: "connection",
      resourceId: input.connectionId,
      requestId: input.requestId,
    });
    return { refreshed: true as const };
  } catch (err) {
    const appErr = oauthError(err);
    if (!AUTH_FAILURES.has(appErr.code)) throw appErr;
    const status = appErr.code === "auth_expired" || appErr.code === "access_revoked" ? "expired" : "error";
    await tx
      .update(connections)
      .set({ status, errorMessage: appErr.message, updatedAt: new Date() })
      .where(eq(connections.id, input.connectionId));
    await enqueueEvent(tx, "integration.failed", input.tenantId, {
      connectionId: input.connectionId,
      workspaceId: input.workspaceId,
      code: appErr.code,
    });
    await recordAudit(tx, {
      eventType: "integration.failed",
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      resourceType: "connection",
      resourceId: input.connectionId,
      payload: { code: appErr.code },
      requestId: input.requestId,
    });
    return { refreshed: false, code: appErr.code, message: appErr.message, httpStatus: appErr.status };
  }
}

function oauthError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ConnectorError) {
    const status = err.code === "auth_expired" || err.code === "access_revoked" ? 409 : 422;
    return new AppError(err.code, err.message, status);
  }
  return new AppError("auth_failed", "OAuth provider request failed", 502);
}
