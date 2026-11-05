import { Hono } from "hono";
import { and, eq, inArray, sql } from "drizzle-orm";
import { isEnabled, ok } from "@marketing-os/core";
import { featureFlagOverrides, featureFlags, selectRows } from "@marketing-os/db";
import { requirePrincipal } from "../auth/principal";
import { requireWorkspace } from "../auth/access";
import { run, tenantContext, userContext, type HonoEnv } from "../context";
import { recordAudit } from "../lib/events";

export const meRoutes = new Hono<HonoEnv>();

type MembershipRow = {
  tenant_id: string;
  tenant_name: string;
  role: string;
  workspace_id: string;
  workspace_name: string;
};

meRoutes.get("/api/v1/me", requirePrincipal, async (c) => {
  const principal = c.get("principal");
  const rows = await run(c, userContext(principal), (tx) =>
    selectRows<MembershipRow>(tx, sql`select * from app.my_memberships()`),
  );
  return c.json(
    ok({
      userId: principal.userId,
      email: principal.email,
      staffRole: principal.staffRole,
      deploymentMode: c.get("config").deploymentMode,
      memberships: rows.map((row) => ({
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        role: row.role,
        workspaceId: row.workspace_id,
        workspaceName: row.workspace_name,
      })),
    }),
  );
});

/** Called by the web app after a successful sign-in, for the login audit trail. */
meRoutes.post("/api/v1/me/login", requirePrincipal, async (c) => {
  const principal = c.get("principal");
  await run(c, userContext(principal), (tx) =>
    recordAudit(tx, {
      eventType: "user.login",
      actorId: principal.userId,
      actorRole: principal.staffRole,
      resourceType: "user",
      resourceId: principal.userId,
      requestId: c.get("requestId"),
    }),
  );
  return c.json(ok({ recorded: true }));
});

/** Flags computed in code from the deployment mode, on top of the database flags. */
function modeFlags(mode: "self_hosted" | "cloud"): Record<string, boolean> {
  return { "nav.leads_admin": mode === "cloud" };
}

meRoutes.get("/api/v1/me/features", requirePrincipal, async (c) => {
  const flags = await run(c, userContext(c.get("principal")), (tx) => tx.select().from(featureFlags));
  const platformDefaults = {
    ...Object.fromEntries(flags.map((flag) => [flag.key, flag.isEnabled])),
    ...modeFlags(c.get("config").deploymentMode),
  };
  return c.json(ok(platformDefaults));
});

meRoutes.get(
  "/api/v1/workspaces/:workspaceId/features",
  requirePrincipal,
  requireWorkspace("cockpit:view"),
  async (c) => {
    const resolved = await run(c, tenantContext(c), async (tx) => {
      const flags = await tx.select().from(featureFlags);
      const overrides = flags.length
        ? await tx
            .select({ flagId: featureFlagOverrides.featureFlagId, isEnabled: featureFlagOverrides.isEnabled })
            .from(featureFlagOverrides)
            .where(
              and(
                eq(featureFlagOverrides.tenantId, c.get("access").tenantId),
                inArray(featureFlagOverrides.featureFlagId, flags.map((f) => f.id)),
              ),
            )
        : [];
      const keyById = new Map(flags.map((flag) => [flag.id, flag.key]));
      const tenantOverrides = Object.fromEntries(
        overrides.map((o) => [keyById.get(o.flagId) ?? "", o.isEnabled]),
      );
      const platformDefaults = {
        ...Object.fromEntries(flags.map((flag) => [flag.key, flag.isEnabled])),
        ...modeFlags(c.get("config").deploymentMode),
      };
      const keys = new Set([...Object.keys(platformDefaults), ...Object.keys(tenantOverrides)]);
      return Object.fromEntries(
        [...keys].map((key) => [key, isEnabled(key, { platformDefaults, tenantOverrides })]),
      );
    });
    return c.json(ok(resolved));
  },
);
