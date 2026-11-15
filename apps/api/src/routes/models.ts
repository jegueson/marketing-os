import { z } from "@hono/zod-openapi";
import { AppError, ok, ValidationError } from "@marketing-os/core";
import {
  loadTenantModelSettings,
  resolveModelCredential,
  saveTenantModelCredential,
} from "@marketing-os/db";
import { requirePrincipal } from "../auth/principal";
import { requireWorkspace } from "../auth/access";
import { run, tenantContext } from "../context";
import { keyRingFromConfig } from "../lib/credentials";
import { recordAudit } from "../lib/events";
import {
  assertModelBaseUrl,
  createModelGateway,
  mapGatewayError,
} from "../lib/model-gateway";
import {
  apiSuccessSchema,
  createRouter,
  defineRoute,
  errorResponses,
  jsonContent,
  uuidPathParam,
} from "../lib/openapi";

export const modelsRoutes = createRouter();

const providerSchema = z.enum(["openrouter", "openai_compatible", "openai", "anthropic"]);

const settingsViewSchema = z.object({
  configured: z.boolean(),
  provider: providerSchema.nullable(),
  baseUrl: z.string().nullable(),
  defaultModel: z.string().nullable(),
  fingerprint: z.string().nullable(),
});

const putBodySchema = z
  .object({
    provider: providerSchema,
    apiKey: z.string().min(8).max(512),
    baseUrl: z.string().url().nullable().optional(),
    defaultModel: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .strict();

const base = "/api/v1/workspaces/{workspaceId}/models";

const getSettingsRoute = defineRoute({
  method: "get",
  path: `${base}/settings`,
  tags: ["Models"],
  security: [{ Bearer: [] }],
  middleware: [requirePrincipal, requireWorkspace("models:manage")],
  request: { params: z.object({ workspaceId: uuidPathParam("workspaceId") }) },
  responses: {
    200: jsonContent(apiSuccessSchema(settingsViewSchema, "ModelSettingsResponse"), "Tenant model settings"),
    ...errorResponses(401, 403, 404, 422),
  },
});

const putSettingsRoute = defineRoute({
  method: "put",
  path: `${base}/settings`,
  tags: ["Models"],
  security: [{ Bearer: [] }],
  middleware: [requirePrincipal, requireWorkspace("models:manage")],
  request: {
    params: z.object({ workspaceId: uuidPathParam("workspaceId") }),
    body: jsonContent(putBodySchema, "Model settings to save"),
  },
  responses: {
    200: jsonContent(apiSuccessSchema(settingsViewSchema, "ModelSettingsSavedResponse"), "Saved model settings"),
    ...errorResponses(401, 403, 404, 422, 503),
  },
});

const testRoute = defineRoute({
  method: "post",
  path: `${base}/test`,
  tags: ["Models"],
  security: [{ Bearer: [] }],
  middleware: [requirePrincipal, requireWorkspace("models:manage")],
  request: { params: z.object({ workspaceId: uuidPathParam("workspaceId") }) },
  responses: {
    200: jsonContent(
      apiSuccessSchema(
        z.object({
          ok: z.literal(true),
          provider: providerSchema,
          fingerprint: z.string(),
          modelCount: z.number().int().nonnegative(),
        }),
        "ModelTestResponse",
      ),
      "Provider reachable with the stored key",
    ),
    ...errorResponses(401, 403, 404, 422, 503),
  },
});

modelsRoutes.openapi(getSettingsRoute, async (c) => {
  const access = c.get("access");
  const settings = await run(c, tenantContext(c), (tx) => loadTenantModelSettings(tx, access.tenantId));
  return c.json(
    ok({
      configured: Boolean(settings?.fingerprint),
      provider: settings?.provider ?? null,
      baseUrl: settings?.baseUrl ?? null,
      defaultModel: settings?.defaultModel ?? null,
      fingerprint: settings?.fingerprint ?? null,
    }),
    200,
  );
});

modelsRoutes.openapi(putSettingsRoute, async (c) => {
  const body = c.req.valid("json");
  const access = c.get("access");
  const config = c.get("config");
  const ring = await keyRingFromConfig(config);
  if (!ring) {
    throw new AppError("credentials_unreadable", "Credential encryption is not configured", 503);
  }

  if (body.provider === "openai_compatible") {
    if (!body.baseUrl) throw new ValidationError("openai_compatible requires a base URL");
    assertModelBaseUrl(body.baseUrl, config.deploymentMode, c.env);
  } else if (body.baseUrl) {
    assertModelBaseUrl(body.baseUrl, config.deploymentMode, c.env);
  }

  const { fingerprint } = await run(c, tenantContext(c), async (tx) => {
    const saved = await saveTenantModelCredential(tx, {
      tenantId: access.tenantId,
      provider: body.provider,
      apiKey: body.apiKey,
      baseUrl: body.baseUrl ?? null,
      defaultModel: body.defaultModel ?? null,
      ring,
    });
    await recordAudit(tx, {
      tenantId: access.tenantId,
      workspaceId: access.workspaceId,
      actorId: c.get("principal").userId,
      actorRole: access.role,
      requestId: c.get("requestId"),
      eventType: "models.settings_saved",
      resourceType: "tenant_model_config",
      resourceId: access.tenantId,
      payload: {
        provider: body.provider,
        fingerprint: saved.fingerprint,
        defaultModel: body.defaultModel ?? null,
      },
    });
    return saved;
  });

  // Never echo the API key. Response is fingerprint + non-secret fields only.
  return c.json(
    ok({
      configured: true,
      provider: body.provider,
      baseUrl: body.baseUrl ?? null,
      defaultModel: body.defaultModel ?? null,
      fingerprint,
    }),
    200,
  );
});

modelsRoutes.openapi(testRoute, async (c) => {
  const access = c.get("access");
  const config = c.get("config");
  const ring = await keyRingFromConfig(config);
  const deps = c.get("deps");

  const credential = await run(c, tenantContext(c), (tx) =>
    resolveModelCredential(tx, { tenantId: access.tenantId, ring }),
  );

  const factory = deps.createModelGateway ?? createModelGateway;
  let modelCount = 0;
  try {
    const gateway = factory(credential, config, c.env);
    const models = await gateway.listModels();
    modelCount = models.length;
  } catch (err) {
    mapGatewayError(err);
  }

  return c.json(
    ok({
      ok: true as const,
      provider: credential.provider,
      fingerprint: credential.fingerprint,
      modelCount,
    }),
    200,
  );
});
