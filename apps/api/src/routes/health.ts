import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { fail, formatLogLine, ok } from "@marketing-os/core";
import { ConfigError, loadEnv, type AppEnv } from "../env";
import type { HonoEnv } from "../context";

export const healthRoutes = new Hono<HonoEnv>();

healthRoutes.get("/healthz", (c) => c.json(ok({ status: "ok" })));

/** Ready only when config validates and the database answers. */
healthRoutes.get("/readyz", async (c) => {
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
      status: "ready",
      database: "ok",
      mode: config.deploymentMode,
      captcha: config.turnstileSecret ? "configured" : "missing",
    }),
  );
});
