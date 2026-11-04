import { Hono } from "hono";
import { ok, isEnabled } from "@marketing-os/core";
import type { HonoEnv } from "../app";
import { requirePrincipal } from "../auth/principal";
import { loadEnv } from "../env";

export const meRoutes = new Hono<HonoEnv>();

meRoutes.get("/api/v1/me", requirePrincipal, (c) => {
  const principal = c.get("principal");
  return c.json(ok(principal));
});

meRoutes.get("/api/v1/me/features", requirePrincipal, (c) => {
  const env = loadEnv(c.env);
  const flags = {
    "cockpit.performance": true,
    "cockpit.leads": true,
    "module.brand": false,
    "nav.leads_admin": env.deploymentMode === "cloud",
  };
  return c.json(
    ok(
      Object.fromEntries(
        Object.entries(flags).map(([key, value]) => [
          key,
          isEnabled(key, { platformDefaults: flags }) && value,
        ]),
      ),
    ),
  );
});
