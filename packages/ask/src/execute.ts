import { toolResultSchema, type ToolResult } from "@marketing-os/schemas";
import type { MetricReader } from "./types";
import type { ValidatedPlan } from "./validate";

const DEFAULT_TIMEOUT_MS = 8_000;

export type PlanExecution = {
  results: ToolResult[];
  qualityWarnings: string[];
};

class StepTimeoutError extends Error {
  constructor() {
    super("Timed out");
    this.name = "StepTimeoutError";
  }
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new StepTimeoutError()), timeoutMs);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function clip(message: string): string {
  const trimmed = message.trim();
  return trimmed.length > 500 ? trimmed.slice(0, 500) : trimmed || "Step failed";
}

function errorResult(stepId: string, tool: ToolResult["tool"], message: string): ToolResult {
  return toolResultSchema.parse({ stepId, tool, status: "error", message: clip(message) });
}

function namespaced(key: string): boolean {
  return /^[a-z0-9]+(?:[._][a-z0-9]+)+$/.test(key);
}

async function runStep(step: ValidatedPlan["steps"][number], reader: MetricReader): Promise<unknown> {
  if (step.tool === "metric_value") {
    const observed = await reader.metricValue({ metricKey: step.metricKey, range: step.range });
    if (observed.status !== "ok" || observed.value == null || !observed.definitionVersion || !observed.source) {
      return {
        stepId: step.id,
        tool: step.tool,
        status: "no_data",
        definitionKey: step.metricKey,
        message: "No versioned value in range",
      };
    }
    return {
      stepId: step.id,
      tool: step.tool,
      status: "ok",
      value: observed.value,
      unit: observed.unit,
      definitionKey: step.metricKey,
      definitionVersion: observed.definitionVersion,
      source: observed.source,
      fetchedAt: observed.fetchedAt,
      coverage: {
        requestedDays: observed.coverage.requestedDays,
        coveredDays: observed.coverage.coveredDays,
      },
    };
  }
  if (step.tool === "metric_compare") {
    const compared = await reader.metricCompare({ metricKey: step.metricKey, range: step.range });
    if (compared.status !== "ok" || compared.current == null || !compared.definitionVersion || !compared.source) {
      return {
        stepId: step.id,
        tool: step.tool,
        status: "no_data",
        definitionKey: step.metricKey,
        message: "No versioned value in range",
      };
    }
    return {
      stepId: step.id,
      tool: step.tool,
      status: "ok",
      current: compared.current,
      previous: compared.previous,
      delta: compared.delta,
      unit: null,
      definitionKey: step.metricKey,
      definitionVersion: compared.definitionVersion,
      source: compared.source,
      fetchedAt: compared.fetchedAt,
    };
  }
  if (step.tool === "data_health") {
    const items = await reader.dataHealth();
    if (items.length === 0) return { stepId: step.id, tool: step.tool, status: "no_data", message: "No connections" };
    return {
      stepId: step.id,
      tool: step.tool,
      status: "ok",
      items: items.map((item) => ({
        connectionId: item.connectionId,
        connector: item.connector,
        health: item.health,
        message: item.message,
      })),
    };
  }
  const metrics = (await reader.listMetrics()).filter((metric) => namespaced(metric.key));
  if (metrics.length === 0) return { stepId: step.id, tool: step.tool, status: "no_data", message: "No metrics" };
  return {
    stepId: step.id,
    tool: step.tool,
    status: "ok",
    metrics: metrics.map((metric) => ({
      key: metric.key,
      label: metric.label,
      unit: metric.unit,
      definitionVersion: metric.version,
      hasData: false,
    })),
  };
}

/** Run validated steps in order. A failed step does not drop the others and does not invent a number. */
export async function executePlan(
  plan: ValidatedPlan,
  reader: MetricReader,
  options?: { timeoutMs?: number },
): Promise<PlanExecution> {
  if (plan.intent !== "answerable") return { results: [], qualityWarnings: [] };
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const results: ToolResult[] = [];
  const qualityWarnings: string[] = [];
  for (const step of plan.steps) {
    try {
      const raw = await withTimeout(runStep(step, reader), timeoutMs);
      const parsed = toolResultSchema.safeParse(raw);
      if (!parsed.success) {
        qualityWarnings.push(`step ${step.id} failed`);
        results.push(errorResult(step.id, step.tool, "Tool result did not match the contract"));
        continue;
      }
      results.push(parsed.data);
    } catch (err) {
      const timedOut = err instanceof StepTimeoutError;
      qualityWarnings.push(timedOut ? `step ${step.id} timed out` : `step ${step.id} failed`);
      results.push(errorResult(step.id, step.tool, timedOut ? "Timed out" : "Step failed"));
    }
  }
  return { results, qualityWarnings };
}
