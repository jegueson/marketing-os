import { z } from "@hono/zod-openapi";
import { sql } from "drizzle-orm";
import { fail, formatLogLine, ok } from "@marketing-os/core";
import { ConfigError, loadEnv, type AppEnv } from "../env";
import { apiSuccessSchema, createRouter, defineRoute, errorResponses, jsonContent } from "../lib/openapi";

export const healthRoutes = createRouter();

const healthzRoute = defineRoute({
  method: "get",
  path: "/healthz",
  tags: ["Health"],
  responses: {
    200: jsonContent(apiSuccessSchema(z.object({ status: z.literal("ok") }), "HealthzResponse"), "Process is up"),
  },
});

const readyzRoute = defineRoute({
  method: "get",
  path: "/readyz",
  tags: ["Health"],
  responses: {
    200: jsonContent(
      apiSuccessSchema(
        z.object({
          status: z.literal("ready"),
          database: z.literal("ok"),
          mode: z.string(),
          captcha: z.enum(["configured", "missing"]),
        }),
        "ReadyzResponse",
      ),
      "Config valid and database reachable",
    ),
    ...errorResponses(503),
  },
});

healthRoutes.openapi(healthzRoute, (c) => c.json(ok({ status: "ok" as const }), 200));

/** Ready only when config validates and the database answers. */
healthRoutes.openapi(readyzRoute, async (c) => {
  let config: AppEnv;
  try {
    config = loadEnv(c.env);
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(formatLogLine({ level: "error", message: "readyz: config invalid", error: err.message }));
    return c.json(fail("not_ready", "Configuration incomplete"), 503);
  }
  const handle = c.get("deps").openDatabase(config);
  try {
    await handle.db.execute(sql`select 1`);
  } catch (err) {
    console.error(
      formatLogLine({
        level: "error",
        message: "readyz: database unreachable",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return c.json(fail("not_ready", "Database unreachable"), 503);
  } finally {
    await handle.close();
  }
  return c.json(
    ok({
      status: "ready" as const,
      database: "ok" as const,
      mode: config.deploymentMode,
      captcha: config.turnstileSecret ? ("configured" as const) : ("missing" as const),
    }),
    200,
  );
});
