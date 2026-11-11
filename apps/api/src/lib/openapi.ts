import { OpenAPIHono, createRoute, z, type RouteConfig } from "@hono/zod-openapi";
import { ValidationError } from "@marketing-os/core";
import type { HonoEnv } from "../context";

/** Shared failure envelope for every documented error response. */
export const apiFailureSchema = z
  .object({
    success: z.literal(false),
    data: z.null(),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    }),
    meta: z.null(),
  })
  .openapi("ApiFailure");

/** Wrap a data schema in the standard success envelope. */
export function apiSuccessSchema<T extends z.ZodTypeAny>(data: T, name: string) {
  return z
    .object({
      success: z.literal(true),
      data,
      error: z.null(),
      meta: z.record(z.string(), z.unknown()).nullable(),
    })
    .openapi(name);
}

/** Opaque JSON value — used when the handler returns a drizzle row shape. */
export const jsonValueSchema = z.any().openapi("JsonValue");

export const uuidPathParam = (name: string) =>
  z
    .string()
    .uuid()
    .openapi({ param: { name, in: "path" }, example: "00000000-0000-4000-8000-000000000000" });

export function jsonContent<T extends z.ZodTypeAny>(schema: T, description: string) {
  return {
    content: { "application/json": { schema } },
    description,
  };
}

type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 503;

/** Keeps the status literals in the type so handlers may return `c.json(fail(...), status)`. */
export function errorResponses<const S extends readonly ErrorStatus[]>(
  ...statuses: S
): { [K in S[number]]: ReturnType<typeof jsonContent<typeof apiFailureSchema>> } {
  const descriptions: Record<number, string> = {
    400: "Bad request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not found",
    409: "Conflict",
    422: "Validation error",
    429: "Rate limited",
    500: "Internal error",
    503: "Not ready",
  };
  return Object.fromEntries(
    statuses.map((status) => [status, jsonContent(apiFailureSchema, descriptions[status] ?? "Error")]),
  ) as { [K in S[number]]: ReturnType<typeof jsonContent<typeof apiFailureSchema>> };
}

export function defineRoute<R extends RouteConfig>(config: R) {
  return createRoute(config);
}

export const openApiDocumentConfig = {
  openapi: "3.1.0" as const,
  info: {
    title: "Marketing OS API",
    version: "0.0.0",
    description: "Hono API Worker for Marketing OS. All data access goes through this API.",
  },
  components: {
    securitySchemes: {
      Bearer: {
        type: "http" as const,
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
};

/** Required JSON request body, documented from a shared schema. */
export function jsonBody<T extends z.ZodTypeAny>(schema: T) {
  return { content: { "application/json": { schema } }, required: true as const };
}

const targetMessages: Record<string, string> = {
  json: "Invalid request body",
  query: "Invalid query",
};

/**
 * Router factory: request validation failures surface as the API's usual 422
 * `validation_error` envelope instead of the library's default response.
 */
export function createRouter() {
  return new OpenAPIHono<HonoEnv>({
    defaultHook: (result) => {
      if (result.success) return;
      const target = String(result.target);
      const field = result.error.issues[0]?.path[0];
      const message =
        targetMessages[target] ?? `Invalid ${typeof field === "string" ? field : "request parameter"}`;
      throw new ValidationError(message, result.error.flatten());
    },
  });
}
