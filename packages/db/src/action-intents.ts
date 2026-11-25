import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { ConflictError, NotFoundError, ValidationError } from "@marketing-os/core";
import { decideWrite, type PolicyAutonomy, type PolicyDefinition } from "@marketing-os/policy";
import { insertActionOutcome } from "./action-outcomes";
import { insertApproval } from "./approvals";
import type { Database } from "./context";
import { actionIntents, type ActionIntentStatus } from "./schema/action-intents";
import { approvals } from "./schema/approvals";

const connectorSlug = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const toolName = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

export type ActionReserve = {
  tenantId: string;
  workspaceId: string;
  connector: string;
  tool: string;
  params: unknown;
  idempotencyKey: string;
  policies: readonly PolicyDefinition[];
  autonomy: PolicyAutonomy;
  requesterId: string;
  evidence: string;
  expectedImpact: string;
  now: Date;
};

export type StoredActionIntent = {
  id: string;
  connector: string;
  tool: string;
  paramsHash: string;
  idempotencyKey: string;
  status: ActionIntentStatus;
  approvalId: string;
  externalId: string | null;
};

type IntentRow = StoredActionIntent & { workspaceId: string };

const returning = {
  id: actionIntents.id,
  workspaceId: actionIntents.workspaceId,
  connector: actionIntents.connector,
  tool: actionIntents.tool,
  paramsHash: actionIntents.paramsHash,
  idempotencyKey: actionIntents.idempotencyKey,
  status: actionIntents.status,
  approvalId: actionIntents.approvalId,
  externalId: actionIntents.externalId,
};

/** Stable JSON so key order does not change the hash. Undefined object keys are omitted. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ValidationError("Action params must be JSON");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new ValidationError("Action params must be JSON");
    }
    const entries = Object.entries(value).filter((entry) => entry[1] !== undefined);
    entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  throw new ValidationError("Action params must be JSON");
}

function hashParams(params: unknown): string {
  return createHash("sha256").update(stableStringify(params)).digest("hex");
}

function requireKey(idempotencyKey: string): string {
  const trimmed = idempotencyKey.trim();
  if (trimmed.length < 1 || trimmed.length > 200) {
    throw new ValidationError("Idempotency key is required");
  }
  return trimmed;
}

function sameIntent(
  row: IntentRow,
  input: { workspaceId: string; connector: string; tool: string },
  paramsHash: string,
): StoredActionIntent {
  if (
    row.workspaceId !== input.workspaceId ||
    row.connector !== input.connector ||
    row.tool !== input.tool ||
    row.paramsHash !== paramsHash
  ) {
    throw new ConflictError("idempotency key already reserved");
  }
  return {
    id: row.id,
    connector: row.connector,
    tool: row.tool,
    paramsHash: row.paramsHash,
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    approvalId: row.approvalId,
    externalId: row.externalId,
  };
}

async function findIntent(tx: Database, tenantId: string, idempotencyKey: string): Promise<IntentRow | null> {
  const [row] = await tx
    .select(returning)
    .from(actionIntents)
    .where(and(eq(actionIntents.tenantId, tenantId), eq(actionIntents.idempotencyKey, idempotencyKey)));
  return row ?? null;
}

/**
 * Insert the intent once, and only after decideWrite asks for approval.
 * A blank key throws before any insert. A denial writes no row.
 * The savepoint drops the approval if another transaction already took the key.
 */
export async function reserveAction(tx: Database, input: ActionReserve): Promise<StoredActionIntent> {
  const idempotencyKey = requireKey(input.idempotencyKey);
  if (!connectorSlug.test(input.connector) || input.connector.length > 80) {
    throw new ValidationError("Action connector is invalid");
  }
  if (!toolName.test(input.tool) || input.tool.length > 80) {
    throw new ValidationError("Action tool is invalid");
  }
  const paramsHash = hashParams(input.params);

  const existing = await findIntent(tx, input.tenantId, idempotencyKey);
  if (existing) {
    return sameIntent(existing, input, paramsHash);
  }

  const decision = decideWrite({
    policies: input.policies,
    connector: input.connector,
    action: input.tool,
    autonomy: input.autonomy,
  });
  if (decision.decision === "deny") {
    throw new ConflictError(`action denied: ${decision.reason}`);
  }

  return insertReserved(tx, input, idempotencyKey, paramsHash, decision.expiresInHours, decision.riskClass);
}

async function insertReserved(
  tx: Database,
  input: ActionReserve,
  idempotencyKey: string,
  paramsHash: string,
  expiresInHours: number,
  riskClass: PolicyDefinition["riskClass"],
): Promise<StoredActionIntent> {
  await tx.execute(sql`savepoint action_reserve`);
  let inserted: IntentRow | undefined;
  try {
    const approval = await insertApproval(tx, {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      requesterId: input.requesterId,
      action: `${input.connector}.${input.tool}`,
      riskLevel: riskClass,
      evidence: input.evidence,
      expectedImpact: input.expectedImpact,
      expiresAt: new Date(input.now.getTime() + expiresInHours * 3_600_000),
    });
    const [row] = await tx
      .insert(actionIntents)
      .values({
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        connector: input.connector,
        tool: input.tool,
        paramsHash,
        idempotencyKey,
        status: "awaiting_approval",
        approvalId: approval.id,
      })
      .onConflictDoNothing({ target: [actionIntents.tenantId, actionIntents.idempotencyKey] })
      .returning(returning);
    inserted = row;
    await tx.execute(inserted ? sql`release savepoint action_reserve` : sql`rollback to savepoint action_reserve`);
  } catch (error) {
    await tx.execute(sql`rollback to savepoint action_reserve`);
    throw error;
  }

  if (!inserted) {
    const raced = await findIntent(tx, input.tenantId, idempotencyKey);
    if (!raced) {
      throw new Error("action intent insert returned no row");
    }
    return sameIntent(raced, input, paramsHash);
  }
  return sameIntent(inserted, input, paramsHash);
}

export type PreparedExecution =
  | { state: "replay"; intentId: string; externalId: string }
  | { state: "ready"; intentId: string; idempotencyKey: string };

/**
 * Decide whether a reserved action may call the connector.
 * A stored external id is returned without writing. A non-approved or past-due
 * approval throws before any connector call.
 */
export async function prepareActionExecution(
  tx: Database,
  input: {
    tenantId: string;
    workspaceId: string;
    connector: string;
    tool: string;
    params: unknown;
    idempotencyKey: string;
    now: Date;
  },
): Promise<PreparedExecution> {
  const idempotencyKey = requireKey(input.idempotencyKey);
  const paramsHash = hashParams(input.params);
  const row = await findIntent(tx, input.tenantId, idempotencyKey);
  if (!row) throw new NotFoundError("Action intent not found");
  sameIntent(row, input, paramsHash);
  if (row.status === "executed") {
    if (!row.externalId) throw new ConflictError("action failed");
    return { state: "replay", intentId: row.id, externalId: row.externalId };
  }
  if (row.status === "failed") throw new ConflictError("action failed");

  const [approval] = await tx
    .select({ status: approvals.status, expiresAt: approvals.expiresAt })
    .from(approvals)
    .where(eq(approvals.id, row.approvalId));
  if (!approval || approval.status !== "approved") {
    throw new ConflictError("action not approved");
  }
  if (approval.expiresAt.getTime() <= input.now.getTime()) {
    throw new ConflictError("approval expired");
  }
  return { state: "ready", intentId: row.id, idempotencyKey };
}

/** Store the external id once, and only while the approval is still approved. */
export async function completeActionExecution(
  tx: Database,
  intentId: string,
  externalId: string,
  now: Date,
): Promise<void> {
  const id = externalId.trim();
  if (id.length < 1 || id.length > 200) {
    throw new ValidationError("External id is required");
  }
  const [intent] = await tx
    .select({
      status: actionIntents.status,
      externalId: actionIntents.externalId,
      approvalId: actionIntents.approvalId,
      tenantId: actionIntents.tenantId,
      workspaceId: actionIntents.workspaceId,
    })
    .from(actionIntents)
    .where(eq(actionIntents.id, intentId))
    .for("update");
  if (!intent) throw new NotFoundError("Action intent not found");
  if (intent.status === "executed" && intent.externalId === id) return;
  if (intent.status !== "awaiting_approval") {
    throw new ConflictError("action intent execution is immutable");
  }
  const [approval] = await tx
    .select({ status: approvals.status, expiresAt: approvals.expiresAt })
    .from(approvals)
    .where(eq(approvals.id, intent.approvalId));
  if (!approval || approval.status !== "approved") {
    throw new ConflictError("action not approved");
  }
  if (approval.expiresAt.getTime() <= now.getTime()) {
    throw new ConflictError("approval expired");
  }
  const updated = await tx
    .update(actionIntents)
    .set({ status: "executed", externalId: id })
    .where(and(eq(actionIntents.id, intentId), eq(actionIntents.status, "awaiting_approval")))
    .returning({ id: actionIntents.id });
  if (updated.length === 0) {
    throw new ConflictError("action intent execution is immutable");
  }
  await insertActionOutcome(tx, {
    tenantId: intent.tenantId,
    workspaceId: intent.workspaceId,
    actionId: intentId,
    externalId: id,
    recordedAt: now,
  });
}

/** Record a connector failure. The row stores no external id. */
export async function failActionExecution(tx: Database, intentId: string): Promise<void> {
  const updated = await tx
    .update(actionIntents)
    .set({ status: "failed" })
    .where(and(eq(actionIntents.id, intentId), eq(actionIntents.status, "awaiting_approval")))
    .returning({ id: actionIntents.id });
  if (updated.length > 0) return;
  const [row] = await tx
    .select({ status: actionIntents.status })
    .from(actionIntents)
    .where(eq(actionIntents.id, intentId));
  if (row?.status === "failed") return;
  throw new ConflictError("action intent execution is immutable");
}
