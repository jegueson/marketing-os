import { z } from "@hono/zod-openapi";
import { AppError, NotFoundError, ValidationError, ok } from "@marketing-os/core";
import { importConfigYaml } from "@marketing-os/db";
import { requirePrincipal } from "../auth/principal";
import { requireWorkspace } from "../auth/access";
import { requireConfigEnabled } from "../auth/config-flag";
import { run, tenantContext } from "../context";
import { recordAudit } from "../lib/events";
import { loadToolCatalog } from "../lib/tool-catalog";
import {
  apiSuccessSchema,
  createRouter,
  defineRoute,
  errorResponses,
  jsonContent,
  uuidPathParam,
} from "../lib/openapi";

export const configImportRoutes = createRouter();

const workspaceParams = z.object({ workspaceId: uuidPathParam("workspaceId") });

const importBodySchema = z
  .object({
    kind: z.enum(["skill", "workflow"]),
    source: z.string().min(1).max(100_000),
  })
  .strict()
  .openapi("ConfigImportBody");

const importResultSchema = z
  .object({
    kind: z.enum(["skill", "workflow"]),
    id: z.string().uuid(),
    name: z.string(),
    version: z.number().int(),
  })
  .openapi("ConfigImportResult");

const importPath = "/api/v1/workspaces/{workspaceId}/config/import";

const writeMiddleware = [requirePrincipal, requireConfigEnabled, requireWorkspace("config:write")];

const importRoute = defineRoute({
  method: "post",
  path: importPath,
  tags: ["Config"],
  security: [{ Bearer: [] }],
  middleware: writeMiddleware,
  request: {
    params: workspaceParams,
    body: jsonContent(importBodySchema, "YAML document to import"),
  },
  responses: {
    200: jsonContent(apiSuccessSchema(importResultSchema, "ConfigImportResponse"), "Imported"),
    ...errorResponses(401, 403, 404, 422),
  },
});

function workspaceId(access: { workspaceId: string | null }): string {
  if (!access.workspaceId) throw new NotFoundError("Workspace not found");
  return access.workspaceId;
}

configImportRoutes.openapi(importRoute, async (c) => {
  const access = c.get("access");
  const principal = c.get("principal");
  const workspace = workspaceId(access);
  const body = c.req.valid("json");

  let result: { kind: "skill" | "workflow"; id: string; name: string; version: number };
  try {
    result = await run(c, tenantContext(c), async (tx) => {
      const imported =
        body.kind === "skill"
          ? await importConfigYaml(tx, {
              tenantId: access.tenantId,
              workspaceId: workspace,
              publishedBy: principal.userId,
              kind: "skill",
              source: body.source,
              catalog: await loadToolCatalog(
                c.get("deps").connectors,
                access.tenantId,
                workspace,
              ),
            })
          : await importConfigYaml(tx, {
              tenantId: access.tenantId,
              workspaceId: workspace,
              publishedBy: principal.userId,
              kind: "workflow",
              source: body.source,
            });
      await recordAudit(tx, {
        eventType:
          body.kind === "skill" ? "config.skill_imported" : "config.workflow_imported",
        tenantId: access.tenantId,
        workspaceId: workspace,
        actorId: principal.userId,
        actorRole: access.role,
        requestId: c.get("requestId"),
        resourceType: body.kind,
        resourceId: imported.id,
        payload: { name: imported.name, version: imported.version },
      });
      return imported;
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new ValidationError(error instanceof Error ? error.message : "Invalid config YAML");
  }

  return c.json(
    ok({
      kind: result.kind,
      id: result.id,
      name: result.name,
      version: result.version,
    }),
    200,
  );
});
