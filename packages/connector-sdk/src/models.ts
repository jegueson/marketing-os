import { z } from "zod";

export const connectorMetadataSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  capabilities: z.array(z.enum(["read", "write", "oauth", "actions"])).default(["read"]),
});

export const authSpecSchema = z.object({
  type: z.enum(["none", "api_key", "oauth2"]),
  scopes: z.array(z.string()).default([]),
  authorizationUrl: z.string().url().optional(),
  tokenUrl: z.string().url().optional(),
});

export const resourceSchema = z.object({
  name: z.string(),
  kind: z.string(),
  description: z.string().optional(),
});

export const metricQuerySchema = z.object({
  metric: z.string(),
  dimensions: z.array(z.string()).default([]),
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export const metricResultSchema = z.object({
  metric: z.string(),
  value: z.number(),
  unit: z.string().optional(),
  lineage: z.object({
    source: z.string(),
    fetchedAt: z.string().datetime(),
    definitionVersion: z.string(),
  }),
});

export const healthResultSchema = z.object({
  status: z.enum(["ok", "degraded", "error"]),
  checkedAt: z.string().datetime(),
  message: z.string().optional(),
});

export const actionSpecSchema = z.object({
  name: z.string(),
  risk: z.enum(["low", "medium", "high"]),
  requiresApproval: z.boolean(),
  idempotencyRequired: z.boolean().default(true),
  supportsRollback: z.boolean().default(false),
});

export const toolSpecSchema = z.object({
  name: z.string(),
  description: z.string(),
  risk: z.enum(["low", "medium", "high"]).default("low"),
});

export type ConnectorMetadata = z.infer<typeof connectorMetadataSchema>;
export type AuthSpec = z.infer<typeof authSpecSchema>;
export type Resource = z.infer<typeof resourceSchema>;
export type MetricQuery = z.infer<typeof metricQuerySchema>;
export type MetricResult = z.infer<typeof metricResultSchema>;
export type HealthResult = z.infer<typeof healthResultSchema>;
export type ActionSpec = z.infer<typeof actionSpecSchema>;
export type ToolSpec = z.infer<typeof toolSpecSchema>;
