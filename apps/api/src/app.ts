import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { AppError, fail, formatLogLine, ok } from "@marketing-os/core";
import type { DbHandle } from "@marketing-os/db";
import { defaultDeps, type AppDeps } from "./deps";
import { loadEnv } from "./env";
import type { AppContext, HonoEnv } from "./context";
import { healthRoutes } from "./routes/health";
import { publicLeadsRoutes } from "./routes/public-leads";
import { meRoutes } from "./routes/me";
import { leadsRoutes } from "./routes/leads";
import { integrationsRoutes } from "./routes/integrations";
import { cockpitRoutes } from "./routes/cockpit";
import { onboardingRoutes } from "./routes/onboarding";
import { invitationRoutes } from "./routes/invitations";
import { consoleRoutes } from "./routes/console";

export type { HonoEnv } from "./context";

function logFields(c: AppContext) {
  const principal = c.get("principal") as HonoEnv["Variables"]["principal"] | undefined;
  const access = c.get("access") as HonoEnv["Variables"]["access"] | undefined;
  return {
    requestId: c.get("requestId"),
    ...(principal ? { userId: principal.userId } : {}),
    ...(access ? { tenantId: access.tenantId } : {}),
    method: c.req.method,
    path: c.req.path,
  };
}

function closeLater(c: AppContext, handle: DbHandle): Promise<void> | undefined {
  const closing = handle.close();
  try {
    c.executionCtx.waitUntil(closing);
    return undefined;
  } catch {
    return closing;
  }
}

export function createApp(overrides: Partial<AppDeps> = {}) {
  const deps: AppDeps = { ...defaultDeps, ...overrides };
  const app = new Hono<HonoEnv>();

  app.use("*", async (c, next) => {
    c.set("requestId", crypto.randomUUID());
    c.set("deps", deps);
    await next();
    c.header("x-request-id", c.get("requestId"));
  });

  app.use("*", secureHeaders({ crossOriginResourcePolicy: "same-site" }));

  app.use("*", async (c, next) => {
    const appOrigin = c.env.APP_ORIGIN ?? "http://127.0.0.1:3000";
    return cors({
      origin: (origin) => (origin === appOrigin ? origin : null),
      credentials: true,
      allowHeaders: ["authorization", "content-type"],
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    })(c, next);
  });

  app.route("/", healthRoutes);

  app.use("/api/*", async (c, next) => {
    const config = loadEnv(c.env);
    c.set("config", config);
    let handle: DbHandle | null = null;
    c.set("db", () => {
      handle ??= deps.openDatabase(config);
      return handle.db;
    });
    try {
      await next();
    } finally {
      if (handle) await closeLater(c, handle);
    }
  });

  app.route("/", publicLeadsRoutes);
  app.route("/", meRoutes);
  app.route("/", leadsRoutes);
  app.route("/", integrationsRoutes);
  app.route("/", cockpitRoutes);
  app.route("/", onboardingRoutes);
  app.route("/", invitationRoutes);
  app.route("/", consoleRoutes);

  app.get("/api/v1", (c) => c.json(ok({ name: "marketing-os-api", version: "0.0.0" })));

  app.notFound((c) => c.json(fail("not_found", "Route not found"), 404));

  app.onError((err, c) => {
    if (err instanceof AppError) {
      if (err.status >= 500) {
        console.error(formatLogLine({ level: "error", message: err.message, ...logFields(c) }));
      }
      return c.json(fail(err.code, err.message, err.details), err.status as 400);
    }
    console.error(
      formatLogLine({ level: "error", message: err.message, name: err.name, ...logFields(c) }),
    );
    return c.json(fail("internal_error", "Unexpected error"), 500);
  });

  return app;
}
