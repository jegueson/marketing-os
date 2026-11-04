import { Hono } from "hono";
import { ok } from "@marketing-os/core";
import { loadEnv } from "../env";
import type { HonoEnv } from "../app";

export const healthRoutes = new Hono<HonoEnv>();

healthRoutes.get("/healthz", (c) => c.json(ok({ status: "ok" })));

healthRoutes.get("/readyz", (c) => {
  loadEnv(c.env);
  const dbConfigured = Boolean(c.env.DATABASE_URL || c.env.HYPERDRIVE?.connectionString);
  return c.json(
    ok({
      status: "ready",
      database: dbConfigured ? "configured" : "missing",
      mode: c.env.MOS_DEPLOYMENT_MODE ?? "self_hosted",
    }),
  );
});
