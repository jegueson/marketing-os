import { ModelGatewayError } from "./errors";
import type {
  CompleteRequest,
  CompleteResponse,
  CostEstimate,
  EmbedRequest,
  EmbedResponse,
  ModelCapabilities,
  ModelGateway,
  ModelInfo,
  ModelProvider,
  StreamChunk,
} from "./types";

export type UsageLedgerStatus = "ok" | "error" | "aborted";

/** One billed/attempted model call. Never includes prompt or response text. */
export type UsageLedgerEntry = {
  tenantId: string;
  workspaceId: string | null;
  userId: string | null;
  runId: string | null;
  purpose: string;
  provider: ModelProvider;
  model: string;
  promptName: string | null;
  promptVersion: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostMicroUsd: number | null;
  costBasis: "provider_list" | "unknown";
  latencyMs: number;
  status: UsageLedgerStatus;
  errorCode: string | null;
};

export type LedgerContext = {
  tenantId: string;
  workspaceId?: string | null;
  userId?: string | null;
  runId?: string | null;
  purpose: string;
  promptName?: string | null;
  promptVersion?: string | null;
};

/** Port for persisting usage. Implementations must not run inside the caller's rolled-back txn. */
export interface UsageSink {
  record(entry: UsageLedgerEntry): Promise<void>;
}

/** In-memory sink for unit tests. */
export class InMemoryUsageSink implements UsageSink {
  readonly entries: UsageLedgerEntry[] = [];

  async record(entry: UsageLedgerEntry): Promise<void> {
    this.entries.push({ ...entry });
  }
}

function baseEntry(
  gateway: ModelGateway,
  ctx: LedgerContext,
  model: string,
  partial: Partial<UsageLedgerEntry> & Pick<UsageLedgerEntry, "status" | "latencyMs">,
): UsageLedgerEntry {
  return {
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId ?? null,
    userId: ctx.userId ?? null,
    runId: ctx.runId ?? null,
    purpose: ctx.purpose,
    provider: gateway.provider,
    model,
    promptName: ctx.promptName ?? null,
    promptVersion: ctx.promptVersion ?? null,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostMicroUsd: null,
    costBasis: "unknown",
    errorCode: null,
    ...partial,
  };
}

async function costFor(
  gateway: ModelGateway,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<Pick<UsageLedgerEntry, "estimatedCostMicroUsd" | "costBasis">> {
  try {
    const estimate = await gateway.estimateCost(model, inputTokens, outputTokens);
    return {
      estimatedCostMicroUsd: estimate.estimatedCostMicroUsd,
      costBasis: estimate.costBasis,
    };
  } catch {
    return { estimatedCostMicroUsd: null, costBasis: "unknown" };
  }
}

function errorCodeOf(err: unknown): string {
  if (err instanceof ModelGatewayError) return err.code;
  if (err instanceof Error && err.name === "AbortError") return "aborted";
  return "provider_unavailable";
}

/** Ledger write must never replace the original gateway error. */
async function safeRecord(sink: UsageSink, entry: UsageLedgerEntry): Promise<void> {
  try {
    await sink.record(entry);
  } catch {
    // Best-effort metering; caller still gets the provider outcome.
  }
}

/**
 * Wraps complete/stream/embed so each call writes exactly one ledger row.
 * listModels / getCapabilities / estimateCost pass through unchanged.
 */
export function withLedger(gateway: ModelGateway, sink: UsageSink, ctx: LedgerContext): ModelGateway {
  return {
    get provider() {
      return gateway.provider;
    },
    listModels: () => gateway.listModels(),
    getCapabilities: (modelId: string) => gateway.getCapabilities(modelId),
    estimateCost: (modelId, inputTokens, outputTokens) =>
      gateway.estimateCost(modelId, inputTokens, outputTokens),

    async complete(request: CompleteRequest): Promise<CompleteResponse> {
      const started = Date.now();
      try {
        const result = await gateway.complete(request);
        const cost = await costFor(gateway, result.model, result.usage.inputTokens, result.usage.outputTokens);
        await safeRecord(
          sink,
          baseEntry(gateway, ctx, result.model, {
            status: "ok",
            latencyMs: result.latencyMs || Date.now() - started,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            ...cost,
          }),
        );
        return result;
      } catch (err) {
        const aborted = err instanceof Error && err.name === "AbortError";
        await safeRecord(
          sink,
          baseEntry(gateway, ctx, request.model, {
            status: aborted ? "aborted" : "error",
            latencyMs: Date.now() - started,
            errorCode: errorCodeOf(err),
          }),
        );
        throw err;
      }
    },

    async *stream(request: CompleteRequest): AsyncIterable<StreamChunk> {
      const started = Date.now();
      let inputTokens = 0;
      let outputTokens = 0;
      let sawDone = false;
      try {
        for await (const chunk of gateway.stream(request)) {
          if (chunk.type === "done") {
            sawDone = true;
            inputTokens = chunk.usage.inputTokens;
            outputTokens = chunk.usage.outputTokens;
          }
          yield chunk;
          if (chunk.type === "done") {
            const cost = await costFor(gateway, request.model, inputTokens, outputTokens);
            await safeRecord(
              sink,
              baseEntry(gateway, ctx, request.model, {
                status: "ok",
                latencyMs: Date.now() - started,
                inputTokens,
                outputTokens,
                ...cost,
              }),
            );
          }
        }
        if (!sawDone) {
          await safeRecord(
            sink,
            baseEntry(gateway, ctx, request.model, {
              status: "aborted",
              latencyMs: Date.now() - started,
              inputTokens,
              outputTokens,
              errorCode: "aborted",
            }),
          );
        }
      } catch (err) {
        if (!sawDone) {
          const aborted = err instanceof Error && err.name === "AbortError";
          await safeRecord(
            sink,
            baseEntry(gateway, ctx, request.model, {
              status: aborted ? "aborted" : "error",
              latencyMs: Date.now() - started,
              inputTokens,
              outputTokens,
              errorCode: errorCodeOf(err),
            }),
          );
        }
        throw err;
      }
    },

    async embed(request: EmbedRequest): Promise<EmbedResponse> {
      const started = Date.now();
      try {
        const result = await gateway.embed(request);
        const cost = await costFor(gateway, request.model, result.usage.inputTokens, 0);
        await safeRecord(
          sink,
          baseEntry(gateway, ctx, request.model, {
            status: "ok",
            latencyMs: result.latencyMs || Date.now() - started,
            inputTokens: result.usage.inputTokens,
            outputTokens: 0,
            ...cost,
          }),
        );
        return result;
      } catch (err) {
        const aborted = err instanceof Error && err.name === "AbortError";
        await safeRecord(
          sink,
          baseEntry(gateway, ctx, request.model, {
            status: aborted ? "aborted" : "error",
            latencyMs: Date.now() - started,
            errorCode: errorCodeOf(err),
          }),
        );
        throw err;
      }
    },
  } satisfies ModelGateway & {
    listModels(): Promise<ModelInfo[]>;
    getCapabilities(modelId: string): Promise<ModelCapabilities>;
    estimateCost(modelId: string, inputTokens: number, outputTokens: number): Promise<CostEstimate>;
  };
}
