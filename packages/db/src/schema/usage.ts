import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { profiles, tenants, workspaces } from "./tenancy";

/** Append-only model usage. No prompt/response columns by design (ADR-0025). */
export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    runId: text("run_id"),
    purpose: text("purpose").notNull(),
    provider: text("provider")
      .notNull()
      .$type<"openrouter" | "openai_compatible" | "openai" | "anthropic">(),
    model: text("model").notNull(),
    promptName: text("prompt_name"),
    promptVersion: text("prompt_version"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    estimatedCostMicroUsd: bigint("estimated_cost_micro_usd", { mode: "number" }),
    costBasis: text("cost_basis").notNull().$type<"provider_list" | "unknown">(),
    latencyMs: integer("latency_ms").notNull().default(0),
    status: text("status").notNull().$type<"ok" | "error" | "aborted">(),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_usage_ledger_tenant_created").on(table.tenantId, table.createdAt),
    check(
      "usage_ledger_provider_check",
      sql`${table.provider} in ('openrouter','openai_compatible','openai','anthropic')`,
    ),
    check("usage_ledger_cost_basis_check", sql`${table.costBasis} in ('provider_list','unknown')`),
    check("usage_ledger_status_check", sql`${table.status} in ('ok','error','aborted')`),
    check(
      "usage_ledger_tokens_check",
      sql`${table.inputTokens} >= 0 and ${table.outputTokens} >= 0`,
    ),
    check("usage_ledger_latency_check", sql`${table.latencyMs} >= 0`),
  ],
);
