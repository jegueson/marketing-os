import { z } from "@hono/zod-openapi";
import { and, eq, inArray, sql } from "drizzle-orm";
import { isEnabled, ok } from "@marketing-os/core";
import { featureFlagOverrides, featureFlags, selectRows } from "@marketing-os/db";
import { requirePrincipal } from "../auth/principal";
import { requireWorkspace } from "../auth/access";
import { run, tenantContext, userContext } from "../context";
import { recordAudit } from "../lib/events";
import {
  apiSuccessSchema,
  createRouter,
  defineRoute,
  errorResponses,
  jsonContent,
  uuidPathParam,
} from "../lib/openapi";

export const meRoutes = createRouter();

const featureMapSchema = z.record(z.string(), z.boolean());

const meRoute = defineRoute({
  method: "get",
  path: "/api/v1/me",
  tags: ["Me"],
  security: [{ Bearer: [] }],
  middleware: [requirePrincipal],
  responses: {
    200: jsonContent(
      apiSuccessSchema(
        z.object({
          userId: z.string(),
          email: z.string(),
          staffRole: z.string().nullable(),
          deploymentMode: z.string(),
          memberships: z.array(
            z.object({
              tenantId: z.string(),
              tenantName: z.string(),
              role: z.string(),
              workspaceId: z.string(),
              workspaceName: z.string(),
            }),
          ),
        }),
        "MeResponse",
      ),
      "Current user and memberships",
    ),
    ...errorResponses(401),
  },
});

const loginRoute = defineRoute({
  method: "post",
  path: "/api/v1/me/login",
  tags: ["Me"],
  security: [{ Bearer: [] }],
  middleware: [requirePrincipal],
  responses: {
    200: jsonContent(apiSuccessSchema(z.object({ recorded: z.literal(true) }), "MeLoginResponse"), "Login recorded"),
    ...errorResponses(401),
  },
});

const meFeaturesRoute = defineRoute({
  method: "get",
  path: "/api/v1/me/features",
  tags: ["Me"],
  security: [{ Bearer: [] }],
  middleware: [requirePrincipal],
  responses: {
    200: jsonContent(apiSuccessSchema(featureMapSchema, "MeFeaturesResponse"), "Platform feature flags"),
    ...errorResponses(401),
  },
});

const workspaceFeaturesRoute = defineRoute({
  method: "get",
  path: "/api/v1/workspaces/{workspaceId}/features",
  tags: ["Me"],
  security: [{ Bearer: [] }],
  middleware: [requirePrincipal, requireWorkspace("cockpit:view")],
  request: { params: z.object({ workspaceId: uuidPathParam("workspaceId") }) },
  responses: {
    200: jsonContent(apiSuccessSchema(featureMapSchema, "WorkspaceFeaturesResponse"), "Resolved workspace flags"),
    ...errorResponses(401, 403, 404, 422),
  },
});

type MembershipRow = {
  tenant_id: string;
  tenant_name: string;
  role: string;
  workspace_id: string;
  workspace_name: string;
};

meRoutes.openapi(meRoute, async (c) => {
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
    200,
  );
});

/** Called by the web app after a successful sign-in, for the login audit trail. */
meRoutes.openapi(loginRoute, async (c) => {
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
  return c.json(ok({ recorded: true as const }), 200);
});

/** Flags computed in code from the deployment mode, on top of the database flags. */
function modeFlags(mode: "self_hosted" | "cloud"): Record<string, boolean> {
  return { "nav.leads_admin": mode === "cloud" };
}

meRoutes.openapi(meFeaturesRoute, async (c) => {
  const flags = await run(c, userContext(c.get("principal")), (tx) => tx.select().from(featureFlags));
  const platformDefaults = {
    ...Object.fromEntries(flags.map((flag) => [flag.key, flag.isEnabled])),
    ...modeFlags(c.get("config").deploymentMode),
  };
  return c.json(ok(platformDefaults), 200);
});

meRoutes.openapi(workspaceFeaturesRoute, async (c) => {
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
    return c.json(ok(resolved), 200);
  });
