import { z } from "zod";

export const connectionCreateSchema = z.object({
  connectorSlug: z.string().trim().min(1).max(100),
  displayName: z.string().trim().min(1).max(200),
});

export const scopeSelectionSchema = z.object({
  resources: z
    .array(
      z.object({
        resourceType: z.string().trim().min(1).max(100),
        resourceId: z.string().trim().min(1).max(200),
        resourceName: z.string().trim().max(200).optional(),
      }),
    )
    .max(200),
});

export const checklistItemUpdateSchema = z.object({
  status: z.enum(["pending", "in_progress", "completed", "skipped"]),
});

export const invitationAcceptSchema = z.object({
  token: z.string().min(20).max(200),
});

export const dataHealthItemSchema = z.object({
  connectionId: z.string().uuid(),
  connector: z.string(),
  displayName: z.string(),
  status: z.enum(["pending", "active", "error", "disconnected", "expired"]),
  health: z.enum(["healthy", "stale", "error", "unknown"]),
  scopes: z.number().int().nonnegative(),
  lastHealthyAt: z.string().nullable(),
  message: z.string().nullable(),
});

export const cockpitViewSchema = z.object({
  header: z.object({
    workspaceId: z.string().uuid(),
    workspaceName: z.string(),
    period: z.object({ from: z.string(), to: z.string(), label: z.string() }),
    freshness: z.enum(["empty", "live", "stale"]),
  }),
  kpi_cards: z.array(z.never()),
  attention_queue: z.array(z.never()),
  recommendations: z.array(z.never()),
  data_health: z.array(dataHealthItemSchema),
  empty_state: z.object({ message: z.string() }).nullable(),
});

export type ConnectionCreate = z.infer<typeof connectionCreateSchema>;
export type ScopeSelection = z.infer<typeof scopeSelectionSchema>;
export type ChecklistItemUpdate = z.infer<typeof checklistItemUpdateSchema>;
export type InvitationAccept = z.infer<typeof invitationAcceptSchema>;
export type DataHealthItem = z.infer<typeof dataHealthItemSchema>;
export type CockpitView = z.infer<typeof cockpitViewSchema>;
