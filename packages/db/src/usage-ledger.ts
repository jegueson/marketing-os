import { withContext, type Database, type DbContext } from "./context";
import { usageLedger } from "./schema/usage";

/** Row shape matching ADR-0025 / model-gateway UsageLedgerEntry. */
export type UsageLedgerInsert = {
  tenantId: string;
  workspaceId?: string | null;
  userId?: string | null;
  runId?: string | null;
  purpose: string;
  provider: "openrouter" | "openai_compatible" | "openai" | "anthropic";
  model: string;
  promptName?: string | null;
  promptVersion?: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostMicroUsd?: number | null;
  costBasis: "provider_list" | "unknown";
  latencyMs: number;
  status: "ok" | "error" | "aborted";
  errorCode?: string | null;
};

/**
 * Inserts one usage row into the given transaction.
 * Prefer {@link recordUsage} so the write is not tied to a caller's txn.
 */
export async function insertUsageLedger(tx: Database, entry: UsageLedgerInsert): Promise<void> {
  await tx.insert(usageLedger).values({
    tenantId: entry.tenantId,
    workspaceId: entry.workspaceId ?? null,
    userId: entry.userId ?? null,
    runId: entry.runId ?? null,
    purpose: entry.purpose,
    provider: entry.provider,
    model: entry.model,
    promptName: entry.promptName ?? null,
    promptVersion: entry.promptVersion ?? null,
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    estimatedCostMicroUsd: entry.estimatedCostMicroUsd ?? null,
    costBasis: entry.costBasis,
    latencyMs: entry.latencyMs,
    status: entry.status,
    errorCode: entry.errorCode ?? null,
  });
}

/**
 * Persists usage in a dedicated context so a caller's rolled-back business
 * transaction cannot erase the ledger write (ADR-0025).
 */
export async function recordUsage(
  db: Database,
  ctx: DbContext,
  entry: UsageLedgerInsert,
): Promise<void> {
  await withContext(db, ctx, (tx) => insertUsageLedger(tx, entry));
}
