import { Hono } from "hono";
import { cors } from "hono/cors";
import { AppError, fail, ok } from "@marketing-os/core";
import { loadEnv } from "./env";
import { publicLeadsRoutes } from "./routes/public-leads";
import { healthRoutes } from "./routes/health";
import { meRoutes } from "./routes/me";
import { leadsRoutes } from "./routes/leads";
import { integrationsRoutes } from "./routes/integrations";
import { cockpitRoutes } from "./routes/cockpit";
import { onboardingRoutes } from "./routes/onboarding";

export type HonoEnv = {
  Bindings: Env;
  Variables: {
    requestId: string;
  };
};

export function createApp() {
  const app = new Hono<HonoEnv>();

  app.use("*", async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set("requestId", requestId);
    await next();
    c.header("x-request-id", requestId);
  });

  app.use("*", async (c, next) => {
    const config = loadEnv(c.env);
    return cors({
      origin: config.appOrigin,
      credentials: true,
    })(c, next);
  });

  app.route("/", healthRoutes);
  app.route("/", publicLeadsRoutes);
  app.route("/", meRoutes);
  app.route("/", leadsRoutes);
  app.route("/", integrationsRoutes);
  app.route("/", cockpitRoutes);
  app.route("/", onboardingRoutes);

  app.notFound((c) => c.json(fail("not_found", "Route not found"), 404));

  app.onError((err, c) => {
    const requestId = c.get("requestId");
    console.error(JSON.stringify({ level: "error", requestId, message: err.message }));
    if (err instanceof AppError) {
      return c.json(fail(err.code, err.message, err.details), err.status as 400);
    }
    return c.json(fail("internal_error", "Unexpected error"), 500);
  });

  app.get("/api/v1", (c) => c.json(ok({ name: "marketing-os-api", version: "0.0.0" })));

  return app;
}
