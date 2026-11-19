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
  StreamChunk,
} from "./types";

/** HTTP status for a hard monthly cap. Provider HTTP 402 maps to the same code. */
export const BUDGET_EXCEEDED_HTTP_STATUS = 402;

export type BudgetEnforcement = "hard" | "warn";

/** Optional tenant cap. Null cap means no limit. */
export type ModelBudget = {
  monthlyCapMicroUsd: number | null;
  enforcement: BudgetEnforcement;
};

export type BillingAuthorizeInput = {
  tenantId: string;
  model: string;
  /** Sum of ledger cost for the current UTC month. Prior months are already excluded. */
  monthSpendMicroUsd: number;
  budget: ModelBudget | null;
};

export type BillingRecordInput = {
  tenantId: string;
  model: string;
  /** Null means this hook did not price the call. The ledger holds the estimate. */
  estimatedCostMicroUsd: number | null;
};

/**
 * Credit purchase lives in the private package. This repo only requires
 * `authorize` (optional cap) and `record` (hook for that package).
 */
export interface BillingProvider {
  authorize(input: BillingAuthorizeInput): Promise<void>;
  record(input: BillingRecordInput): Promise<void>;
}

/**
 * Applies the optional monthly cap and records nothing.
 * Parallel requests may overshoot the cap; v0.1.0-alpha does not serialize them.
 */
export class NoopBillingProvider implements BillingProvider {
  async authorize(input: BillingAuthorizeInput): Promise<void> {
    const cap = input.budget?.monthlyCapMicroUsd;
    if (input.budget?.enforcement !== "hard" || cap == null) return;
    if (input.monthSpendMicroUsd >= cap) {
      throw new ModelGatewayError("Monthly model budget exceeded", "budget_exceeded");
    }
  }

  async record(_input: BillingRecordInput): Promise<void> {
    // Invoices and credit balances are not implemented here.
  }
}

export type BudgetSnapshot = {
  budget: ModelBudget | null;
  monthSpendMicroUsd: number;
};

export type BudgetLookup = (tenantId: string) => Promise<BudgetSnapshot>;

async function safeRecord(billing: BillingProvider, input: BillingRecordInput): Promise<void> {
  try {
    await billing.record(input);
  } catch {
    // A billing hook failure must not hide a completed model call.
  }
}

/** Checks the cap before complete, stream, and embed. Catalog and pricing calls pass through. */
export function withBudget(
  gateway: ModelGateway,
  billing: BillingProvider,
  lookup: BudgetLookup,
  tenantId: string,
): ModelGateway {
  async function authorize(model: string): Promise<void> {
    const snapshot = await lookup(tenantId);
    await billing.authorize({
      tenantId,
      model,
      monthSpendMicroUsd: snapshot.monthSpendMicroUsd,
      budget: snapshot.budget,
    });
  }

  return {
    get provider() {
      return gateway.provider;
    },
    listModels: () => gateway.listModels(),
    getCapabilities: (modelId: string) => gateway.getCapabilities(modelId),
    estimateCost: (modelId, inputTokens, outputTokens) =>
      gateway.estimateCost(modelId, inputTokens, outputTokens),

    async complete(request: CompleteRequest): Promise<CompleteResponse> {
      await authorize(request.model);
      const result = await gateway.complete(request);
      await safeRecord(billing, {
        tenantId,
        model: result.model,
        estimatedCostMicroUsd: null,
      });
      return result;
    },

    async *stream(request: CompleteRequest): AsyncIterable<StreamChunk> {
      await authorize(request.model);
      let sawDone = false;
      for await (const chunk of gateway.stream(request)) {
        if (chunk.type === "done") sawDone = true;
        yield chunk;
      }
      if (sawDone) {
        await safeRecord(billing, {
          tenantId,
          model: request.model,
          estimatedCostMicroUsd: null,
        });
      }
    },

    async embed(request: EmbedRequest): Promise<EmbedResponse> {
      await authorize(request.model);
      const result = await gateway.embed(request);
      await safeRecord(billing, {
        tenantId,
        model: request.model,
        estimatedCostMicroUsd: null,
      });
      return result;
    },
  } satisfies ModelGateway & {
    listModels(): Promise<ModelInfo[]>;
    getCapabilities(modelId: string): Promise<ModelCapabilities>;
    estimateCost(modelId: string, inputTokens: number, outputTokens: number): Promise<CostEstimate>;
  };
}
