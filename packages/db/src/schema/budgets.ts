import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenancy";

/** Optional monthly model spend cap. One row per tenant (ADR-0025). */
export const modelBudgets = pgTable(
  "model_budgets",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    monthlyCapMicroUsd: bigint("monthly_cap_micro_usd", { mode: "number" }),
    enforcement: text("enforcement").notNull().$type<"hard" | "warn">(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("model_budgets_tenant_unique").on(table.tenantId),
    index("idx_model_budgets_tenant").on(table.tenantId),
    check("model_budgets_enforcement_check", sql`${table.enforcement} in ('hard','warn')`),
    check(
      "model_budgets_cap_check",
      sql`${table.monthlyCapMicroUsd} is null or ${table.monthlyCapMicroUsd} >= 0`,
    ),
  ],
);
