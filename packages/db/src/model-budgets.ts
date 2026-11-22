import { eq, sql } from "drizzle-orm";
import { AppError } from "@marketing-os/core";
import { selectRows, type Database } from "./context";
import { modelBudgets } from "./schema/budgets";

export type BudgetEnforcement = "hard" | "warn";
export type BudgetCostBasis = "provider_list" | "unknown";

export type ModelBudgetInput = {
  tenantId: string;
  monthlyCapMicroUsd: number | null;
  enforcement: BudgetEnforcement;
  /** Pricing of the model this cap will govern. Hard caps need a published price. */
  costBasis: BudgetCostBasis;
};

export type StoredModelBudget = {
  monthlyCapMicroUsd: number | null;
  enforcement: BudgetEnforcement;
};

export type BudgetSnapshot = {
  budget: StoredModelBudget | null;
  monthSpendMicroUsd: number;
};

/** Ledger totals for the UTC month, plus the saved cap. */
export type UsageMonthSummary = {
  periodStart: string;
  periodEnd: string;
  totalCostMicroUsd: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  budget: StoredModelBudget | null;
};

/** Inclusive start and exclusive end of the UTC calendar month containing `now`. */
export function utcMonthBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

function assertSavable(input: ModelBudgetInput): void {
  if (input.enforcement !== "hard" && input.enforcement !== "warn") {
    throw new AppError("invalid_request", "Budget enforcement must be hard or warn", 422);
  }
  const cap = input.monthlyCapMicroUsd;
  if (cap != null && (!Number.isSafeInteger(cap) || cap < 0)) {
    throw new AppError("invalid_request", "Monthly cap must be a non-negative integer number of micro-USD", 422);
  }
  if (input.enforcement === "hard" && input.costBasis !== "provider_list") {
    throw new AppError("invalid_request", "A hard monthly cap requires a model with published pricing", 422);
  }
}

/** Upserts the tenant cap. Rejects a hard cap when the model price is unknown. */
export async function saveModelBudget(tx: Database, input: ModelBudgetInput): Promise<void> {
  assertSavable(input);
  await tx
    .insert(modelBudgets)
    .values({
      tenantId: input.tenantId,
      monthlyCapMicroUsd: input.monthlyCapMicroUsd,
      enforcement: input.enforcement,
    })
    .onConflictDoUpdate({
      target: modelBudgets.tenantId,
      set: {
        monthlyCapMicroUsd: input.monthlyCapMicroUsd,
        enforcement: input.enforcement,
        updatedAt: new Date(),
      },
    });
}

export async function loadModelBudget(tx: Database, tenantId: string): Promise<StoredModelBudget | null> {
  const [row] = await tx
    .select({
      monthlyCapMicroUsd: modelBudgets.monthlyCapMicroUsd,
      enforcement: modelBudgets.enforcement,
    })
    .from(modelBudgets)
    .where(eq(modelBudgets.tenantId, tenantId));
  if (!row) return null;
  return { monthlyCapMicroUsd: row.monthlyCapMicroUsd, enforcement: row.enforcement };
}

/** Ledger spend for the UTC month. Null costs add nothing. Other months are excluded. */
export async function sumUtcMonthSpendMicroUsd(
  tx: Database,
  tenantId: string,
  now: Date = new Date(),
): Promise<number> {
  const { start, end } = utcMonthBounds(now);
  const rows = await selectRows<{ total: string | number }>(
    tx,
    sql`select coalesce(sum(estimated_cost_micro_usd), 0)::bigint as total
        from usage_ledger
        where tenant_id = ${tenantId}
          and created_at >= ${start}
          and created_at < ${end}`,
  );
  return asNonNegativeInt(rows[0]?.total, "Monthly model spend");
}

function asNonNegativeInt(value: string | number | undefined, label: string): number {
  const total = Number(value ?? 0);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new AppError("internal_error", `${label} is outside the safe integer range`, 500);
  }
  return total;
}

/** Sums every ledger row in the UTC month. Null costs add nothing. */
export async function summarizeModelUsage(
  tx: Database,
  tenantId: string,
  now: Date = new Date(),
): Promise<UsageMonthSummary> {
  const { start, end } = utcMonthBounds(now);
  const rows = await selectRows<{
    total_cost: string | number;
    input_tokens: string | number;
    output_tokens: string | number;
    calls: string | number;
  }>(
    tx,
    sql`select coalesce(sum(estimated_cost_micro_usd), 0)::bigint as total_cost,
               coalesce(sum(input_tokens), 0)::bigint as input_tokens,
               coalesce(sum(output_tokens), 0)::bigint as output_tokens,
               count(*)::bigint as calls
        from usage_ledger
        where tenant_id = ${tenantId}
          and created_at >= ${start}
          and created_at < ${end}`,
  );
  const row = rows[0];
  const budget = await loadModelBudget(tx, tenantId);
  return {
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    totalCostMicroUsd: asNonNegativeInt(row?.total_cost, "Monthly model spend"),
    inputTokens: asNonNegativeInt(row?.input_tokens, "Monthly input tokens"),
    outputTokens: asNonNegativeInt(row?.output_tokens, "Monthly output tokens"),
    calls: asNonNegativeInt(row?.calls, "Monthly model calls"),
    budget,
  };
}

export async function loadBudgetSnapshot(
  tx: Database,
  tenantId: string,
  now: Date = new Date(),
): Promise<BudgetSnapshot> {
  const budget = await loadModelBudget(tx, tenantId);
  const monthSpendMicroUsd = await sumUtcMonthSpendMicroUsd(tx, tenantId, now);
  return { budget, monthSpendMicroUsd };
}
