import { z } from "./zod";

export const connectionCreateSchema = z
  .object({
    connectorSlug: z.string().trim().min(1).max(100),
    displayName: z.string().trim().min(1).max(200),
  })
  .openapi("ConnectionCreate");

export const scopeSelectionSchema = z
  .object({
    resources: z
      .array(
        z.object({
          resourceType: z.string().trim().min(1).max(100),
          resourceId: z.string().trim().min(1).max(200),
          resourceName: z.string().trim().max(200).optional(),
        }),
      )
      .max(200),
  })
  .openapi("ScopeSelection");

export const checklistItemUpdateSchema = z
  .object({
    status: z.enum(["pending", "in_progress", "completed", "skipped"]),
  })
  .openapi("ChecklistItemUpdate");

export const invitationAcceptSchema = z
  .object({
    token: z.string().min(20).max(200),
  })
  .openapi("InvitationAccept");

/** `z.never()` is not representable in OpenAPI, so document the always-empty arrays as object lists. */
const NEVER_ITEM = z.never().openapi({ type: "object" });

export const dataHealthItemSchema = z
  .object({
    connectionId: z.string().uuid(),
    connector: z.string(),
    displayName: z.string(),
    status: z.enum(["pending", "active", "error", "disconnected", "expired"]),
    health: z.enum(["healthy", "stale", "error", "never_synced"]),
    scopes: z.number().int().nonnegative(),
    lastHealthyAt: z.string().nullable(),
    message: z.string().nullable(),
  })
  .openapi("DataHealthItem");

export const cockpitMetricSchema = z
  .object({
    key: z.string(),
    value: z.string(),
    definitionVersion: z.string(),
    source: z.string(),
    fetchedAt: z.string(),
  })
  .openapi("CockpitMetric");

export const cockpitViewSchema = z
  .object({
    header: z.object({
      workspaceId: z.string().uuid(),
      workspaceName: z.string(),
      period: z.object({ from: z.string(), to: z.string(), label: z.string() }),
      freshness: z.enum(["empty", "live", "stale"]),
    }),
    // Empty until Sprint 2 widgets land; z.never() keeps the array empty at runtime.
    kpi_cards: z.array(NEVER_ITEM),
    attention_queue: z.array(NEVER_ITEM),
    recommendations: z.array(NEVER_ITEM),
    metrics: z.array(cockpitMetricSchema),
    data_health: z.array(dataHealthItemSchema),
    empty_state: z.object({ message: z.string() }).nullable(),
  })
  .openapi("CockpitView");

export type ConnectionCreate = z.infer<typeof connectionCreateSchema>;
export type ScopeSelection = z.infer<typeof scopeSelectionSchema>;
export type ChecklistItemUpdate = z.infer<typeof checklistItemUpdateSchema>;
export type InvitationAccept = z.infer<typeof invitationAcceptSchema>;
export type DataHealthItem = z.infer<typeof dataHealthItemSchema>;
export type CockpitView = z.infer<typeof cockpitViewSchema>;
