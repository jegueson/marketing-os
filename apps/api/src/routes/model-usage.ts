import { z } from "@hono/zod-openapi";
import { AppError, ok } from "@marketing-os/core";
import { resolveModelCredential, saveModelBudget, summarizeModelUsage } from "@marketing-os/db";
import type { CostEstimate } from "@marketing-os/model-gateway";
import { requirePrincipal } from "../auth/principal";
import { requireWorkspace } from "../auth/access";
import { run, tenantContext, type AppContext } from "../context";
import { keyRingFromConfig } from "../lib/credentials";
import { recordAudit } from "../lib/events";
import { createModelGateway, mapGatewayError } from "../lib/model-gateway";
import {
  apiSuccessSchema,
  createRouter,
  defineRoute,
  errorResponses,
  jsonContent,
  uuidPathParam,
} from "../lib/openapi";

export const modelUsageRoutes = createRouter();

const enforcementSchema = z.enum(["hard", "warn"]);

const budgetSchema = z
  .object({
    monthlyCapMicroUsd: z.number().int().nonnegative().nullable(),
    enforcement: enforcementSchema,
  })
  .strict();

const usageSchema = z
  .object({
    periodStart: z.string(),
    periodEnd: z.string(),
    totalCostMicroUsd: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    calls: z.number().int().nonnegative(),
    budget: budgetSchema.nullable(),
  })
  .strict();

const putBodySchema = z
  .object({
    monthlyCapMicroUsd: z.number().int().nonnegative().nullable(),
    enforcement: enforcementSchema,
  })
  .strict();

const base = "/api/v1/workspaces/{workspaceId}/models";

const getUsageRoute = defineRoute({
  method: "get",
  path: `${base}/usage`,
  tags: ["Models"],
  security: [{ Bearer: [] }],
  middleware: [requirePrincipal, requireWorkspace("usage:read")],
  request: { params: z.object({ workspaceId: uuidPathParam("workspaceId") }) },
  responses: {
    200: jsonContent(apiSuccessSchema(usageSchema, "ModelUsageResponse"), "UTC-month model usage"),
    ...errorResponses(401, 403, 404),
  },
});

const putBudgetRoute = defineRoute({
  method: "put",
  path: `${base}/budget`,
  tags: ["Models"],
  security: [{ Bearer: [] }],
  middleware: [requirePrincipal, requireWorkspace("models:manage")],
  request: {
    params: z.object({ workspaceId: uuidPathParam("workspaceId") }),
    body: jsonContent(putBodySchema, "Monthly model budget"),
  },
  responses: {
    200: jsonContent(apiSuccessSchema(budgetSchema, "ModelBudgetResponse"), "Saved model budget"),
    ...errorResponses(401, 403, 404, 422, 503),
  },
});

modelUsageRoutes.openapi(getUsageRoute, async (c) => {
  const access = c.get("access");
  const summary = await run(c, tenantContext(c), (tx) => summarizeModelUsage(tx, access.tenantId));
  return c.json(ok(summary), 200);
});

modelUsageRoutes.openapi(putBudgetRoute, async (c) => {
  const body = c.req.valid("json");
  const access = c.get("access");
  const costBasis = body.enforcement === "hard" ? await costBasisForDefaultModel(c) : "unknown";

  await run(c, tenantContext(c), async (tx) => {
    await saveModelBudget(tx, {
      tenantId: access.tenantId,
      monthlyCapMicroUsd: body.monthlyCapMicroUsd,
      enforcement: body.enforcement,
      costBasis,
    });
    await recordAudit(tx, {
      tenantId: access.tenantId,
      workspaceId: access.workspaceId,
      actorId: c.get("principal").userId,
      actorRole: access.role,
      requestId: c.get("requestId"),
      eventType: "models.budget_saved",
      resourceType: "model_budgets",
      resourceId: access.tenantId,
      payload: {
        enforcement: body.enforcement,
        monthlyCapMicroUsd: body.monthlyCapMicroUsd,
      },
    });
  });

  return c.json(
    ok({
      monthlyCapMicroUsd: body.monthlyCapMicroUsd,
      enforcement: body.enforcement,
    }),
    200,
  );
});

/**
 * Hard caps need a published price on the tenant default model.
 * A missing key, missing model, or null price is `unknown` and the save rejects it.
 */
async function costBasisForDefaultModel(c: AppContext): Promise<CostEstimate["costBasis"]> {
  const config = c.get("config");
  const ring = await keyRingFromConfig(config);
  const access = c.get("access");
  let credential: Awaited<ReturnType<typeof resolveModelCredential>>;
  try {
    credential = await run(c, tenantContext(c), (tx) =>
      resolveModelCredential(tx, { tenantId: access.tenantId, ring }),
    );
  } catch (err) {
    if (err instanceof AppError && err.code === "model_not_configured") return "unknown";
    throw err;
  }
  if (!credential.defaultModel) return "unknown";

  const factory = c.get("deps").createModelGateway ?? createModelGateway;
  try {
    const models = await factory(credential, config, c.env).listModels();
    const model = models.find((entry) => entry.id === credential.defaultModel);
    if (!model || model.inputPriceMicroUsdPer1M == null || model.outputPriceMicroUsdPer1M == null) {
      return "unknown";
    }
    return "provider_list";
  } catch (err) {
    mapGatewayError(err);
  }
}
