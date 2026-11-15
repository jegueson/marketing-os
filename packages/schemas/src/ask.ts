import { z } from "./zod";

/** Server-resolved range presets. The model never emits absolute dates. */
export const askRangePresetSchema = z
  .enum(["last_7_days", "last_30_days", "this_month", "last_month", "previous_period"])
  .openapi("AskRangePreset");

/** Primary range presets. `previous_period` is only valid as `compareTo`. */
export const askPrimaryRangePresetSchema = z
  .enum(["last_7_days", "last_30_days", "this_month", "last_month"])
  .openapi("AskPrimaryRangePreset");

export const askToolNameSchema = z
  .enum(["metric_value", "metric_compare", "data_health", "list_metrics"])
  .openapi("AskToolName");

export const askIntentSchema = z
  .enum(["answerable", "out_of_scope", "needs_clarification", "unsupported_dimension"])
  .openapi("AskIntent");

/** Metric keys are source-namespaced identifiers, not free text. */
export const askMetricKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:[._][a-z0-9]+)+$/, "metric key must be namespaced (e.g. mock.spend)")
  .openapi("AskMetricKey");

const stepIdSchema = z.string().trim().min(1).max(40);

export const queryPlanStepSchema = z
  .discriminatedUnion("tool", [
    z
      .object({
        id: stepIdSchema,
        tool: z.literal("metric_value"),
        metricKey: askMetricKeySchema,
        range: askPrimaryRangePresetSchema,
      })
      .strict()
      .openapi("QueryPlanStepMetricValue"),
    z
      .object({
        id: stepIdSchema,
        tool: z.literal("metric_compare"),
        metricKey: askMetricKeySchema,
        range: askPrimaryRangePresetSchema,
        compareTo: z.literal("previous_period"),
      })
      .strict()
      .openapi("QueryPlanStepMetricCompare"),
    z
      .object({
        id: stepIdSchema,
        tool: z.literal("data_health"),
      })
      .strict()
      .openapi("QueryPlanStepDataHealth"),
    z
      .object({
        id: stepIdSchema,
        tool: z.literal("list_metrics"),
      })
      .strict()
      .openapi("QueryPlanStepListMetrics"),
  ])
  .openapi("QueryPlanStep");

const uniqueStepIds = (steps: { id: string }[], ctx: z.RefinementCtx) => {
  const seen = new Set<string>();
  for (const step of steps) {
    if (seen.has(step.id)) {
      ctx.addIssue({ code: "custom", message: `duplicate step id: ${step.id}`, path: ["steps"] });
      return;
    }
    seen.add(step.id);
  }
};

export const queryPlanSchema = z
  .discriminatedUnion("intent", [
    z
      .object({
        intent: z.literal("answerable"),
        steps: z.array(queryPlanStepSchema).min(1).max(6),
      })
      .strict()
      .superRefine((plan, ctx) => uniqueStepIds(plan.steps, ctx))
      .openapi("QueryPlanAnswerable"),
    z
      .object({
        intent: z.literal("out_of_scope"),
        refusalMessage: z.string().trim().min(1).max(500),
        steps: z.tuple([]),
      })
      .strict()
      .openapi("QueryPlanOutOfScope"),
    z
      .object({
        intent: z.literal("needs_clarification"),
        clarification: z.string().trim().min(1).max(500),
        steps: z.tuple([]),
      })
      .strict()
      .openapi("QueryPlanNeedsClarification"),
    z
      .object({
        intent: z.literal("unsupported_dimension"),
        refusalMessage: z.string().trim().min(1).max(500),
        steps: z.tuple([]),
      })
      .strict()
      .openapi("QueryPlanUnsupportedDimension"),
  ])
  .openapi("QueryPlan");

const coverageSchema = z
  .object({
    requestedDays: z.number().int().nonnegative(),
    coveredDays: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.coveredDays > c.requestedDays) {
      ctx.addIssue({
        code: "custom",
        message: "coveredDays cannot exceed requestedDays",
        path: ["coveredDays"],
      });
    }
  })
  .openapi("AskCoverage");

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .openapi("AskIsoDate");

const toolStatusOk = z.literal("ok");
const toolStatusNoData = z.literal("no_data");
const toolStatusError = z.literal("error");

export const toolResultSchema = z
  .discriminatedUnion("tool", [
    z
      .discriminatedUnion("status", [
        z
          .object({
            stepId: stepIdSchema,
            tool: z.literal("metric_value"),
            status: toolStatusOk,
            value: z.number(),
            previous: z.number().nullable().optional(),
            unit: z.string().min(1).max(40).nullable(),
            definitionKey: askMetricKeySchema,
            definitionVersion: z.string().trim().min(1).max(40),
            source: z.string().trim().min(1).max(100),
            fetchedAt: z.string().datetime().nullable(),
            coverage: coverageSchema.optional(),
          })
          .strict(),
        z
          .object({
            stepId: stepIdSchema,
            tool: z.literal("metric_value"),
            status: toolStatusNoData,
            definitionKey: askMetricKeySchema.optional(),
            message: z.string().trim().min(1).max(500).optional(),
          })
          .strict(),
        z
          .object({
            stepId: stepIdSchema,
            tool: z.literal("metric_value"),
            status: toolStatusError,
            message: z.string().trim().min(1).max(500),
          })
          .strict(),
      ])
      .openapi("ToolResultMetricValue"),
    z
      .discriminatedUnion("status", [
        z
          .object({
            stepId: stepIdSchema,
            tool: z.literal("metric_compare"),
            status: toolStatusOk,
            current: z.number(),
            previous: z.number().nullable(),
            delta: z.number().nullable(),
            unit: z.string().min(1).max(40).nullable(),
            definitionKey: askMetricKeySchema,
            definitionVersion: z.string().trim().min(1).max(40),
            source: z.string().trim().min(1).max(100),
            fetchedAt: z.string().datetime().nullable(),
            coverage: coverageSchema.optional(),
          })
          .strict(),
        z
          .object({
            stepId: stepIdSchema,
            tool: z.literal("metric_compare"),
            status: toolStatusNoData,
            definitionKey: askMetricKeySchema.optional(),
            message: z.string().trim().min(1).max(500).optional(),
          })
          .strict(),
        z
          .object({
            stepId: stepIdSchema,
            tool: z.literal("metric_compare"),
            status: toolStatusError,
            message: z.string().trim().min(1).max(500),
          })
          .strict(),
      ])
      .openapi("ToolResultMetricCompare"),
    z
      .discriminatedUnion("status", [
        z
          .object({
            stepId: stepIdSchema,
            tool: z.literal("data_health"),
            status: toolStatusOk,
            items: z
              .array(
                z
                  .object({
                    connectionId: z.string().uuid(),
                    connector: z.string().trim().min(1).max(100),
                    health: z.enum(["healthy", "stale", "error", "never_synced"]),
                    message: z.string().max(500).nullable(),
                  })
                  .strict(),
              )
              .max(100),
          })
          .strict(),
        z
          .object({
            stepId: stepIdSchema,
            tool: z.literal("data_health"),
            status: toolStatusNoData,
            message: z.string().trim().min(1).max(500).optional(),
          })
          .strict(),
        z
          .object({
            stepId: stepIdSchema,
            tool: z.literal("data_health"),
            status: toolStatusError,
            message: z.string().trim().min(1).max(500),
          })
          .strict(),
      ])
      .openapi("ToolResultDataHealth"),
    z
      .discriminatedUnion("status", [
        z
          .object({
            stepId: stepIdSchema,
            tool: z.literal("list_metrics"),
            status: toolStatusOk,
            metrics: z
              .array(
                z
                  .object({
                    key: askMetricKeySchema,
                    label: z.string().trim().min(1).max(200),
                    unit: z.string().min(1).max(40).nullable(),
                    definitionVersion: z.string().trim().min(1).max(40),
                    hasData: z.boolean(),
                  })
                  .strict(),
              )
              .max(200),
          })
          .strict(),
        z
          .object({
            stepId: stepIdSchema,
            tool: z.literal("list_metrics"),
            status: toolStatusNoData,
            message: z.string().trim().min(1).max(500).optional(),
          })
          .strict(),
        z
          .object({
            stepId: stepIdSchema,
            tool: z.literal("list_metrics"),
            status: toolStatusError,
            message: z.string().trim().min(1).max(500),
          })
          .strict(),
      ])
      .openapi("ToolResultListMetrics"),
  ])
  .openapi("AskToolResult");

export const observedFactSchema = z
  .object({
    ref: z.string().trim().min(1).max(40),
    stepId: stepIdSchema,
    label: z.string().trim().min(1).max(200),
    value: z.number().nullable(),
    unit: z.string().min(1).max(40).nullable(),
    definitionKey: askMetricKeySchema,
    definitionVersion: z.string().trim().min(1).max(40),
  })
  .strict()
  .openapi("AskObservedFact");

export const evidenceSchema = z
  .object({
    sources: z
      .array(
        z
          .object({
            connectionId: z.string().uuid(),
            connector: z.string().trim().min(1).max(100),
            displayName: z.string().trim().min(1).max(200),
          })
          .strict(),
      )
      .max(50),
    range: z
      .object({
        preset: askPrimaryRangePresetSchema,
        from: isoDateSchema,
        to: isoDateSchema,
        label: z.string().trim().min(1).max(100),
      })
      .strict()
      .superRefine((r, ctx) => {
        if (r.from > r.to) {
          ctx.addIssue({ code: "custom", message: "from must be <= to", path: ["from"] });
        }
      }),
    filters: z
      .object({
        workspaceId: z.string().uuid().optional(),
        source: z.string().trim().min(1).max(100).optional(),
      })
      .strict(),
    freshness: z.enum(["live", "stale", "empty", "error"]),
    qualityWarnings: z.array(z.string().trim().min(1).max(500)).max(20),
    assumptions: z.array(z.string().trim().min(1).max(500)).max(20),
    definitions: z
      .array(
        z
          .object({
            key: askMetricKeySchema,
            version: z.string().trim().min(1).max(40),
            label: z.string().trim().min(1).max(200),
          })
          .strict(),
      )
      .max(50),
    /** Numbers and facts returned by tools. Never model prose. */
    observed: z.array(observedFactSchema).max(50),
  })
  .strict()
  .superRefine((e, ctx) => {
    const refs = new Set<string>();
    for (const fact of e.observed) {
      if (refs.has(fact.ref)) {
        ctx.addIssue({ code: "custom", message: `duplicate observed ref: ${fact.ref}`, path: ["observed"] });
        return;
      }
      refs.add(fact.ref);
    }
  })
  .openapi("AskEvidence");

export const answerSchema = z
  .object({
    observations: z.array(z.string().trim().min(1).max(1000)).max(20),
    interpretation: z.string().max(4000),
    assumptions: z.array(z.string().trim().min(1).max(500)).max(20),
    evidence: evidenceSchema,
  })
  .strict()
  .superRefine((answer, ctx) => {
    const refs = new Set(answer.evidence.observed.map((f) => f.ref));
    const placeholder = /\{\{([a-zA-Z0-9_]+)\}\}/g;
    for (const [i, line] of answer.observations.entries()) {
      for (const match of line.matchAll(placeholder)) {
        const ref = match[1]!;
        if (!refs.has(ref)) {
          ctx.addIssue({
            code: "custom",
            message: `unknown observation ref: ${ref}`,
            path: ["observations", i],
          });
        }
      }
    }
  })
  .openapi("AskAnswer");

export const askRefusalCodeSchema = z
  .enum([
    "out_of_scope",
    "needs_clarification",
    "unsupported_dimension",
    "no_data",
    "plan_invalid",
    "budget_exceeded",
    "model_unavailable",
  ])
  .openapi("AskRefusalCode");

export const askErrorCodeSchema = z
  .enum([
    "model_unavailable",
    "model_not_configured",
    "budget_exceeded",
    "plan_invalid",
    "rate_limited",
    "internal_error",
  ])
  .openapi("AskErrorCode");

export const askStreamEventSchema = z
  .discriminatedUnion("type", [
    z
      .object({
        type: z.literal("stage"),
        stage: z.enum(["intent", "definitions", "sources", "query_plan", "validation", "answer"]),
      })
      .strict()
      .openapi("AskStreamEventStage"),
    z
      .object({
        type: z.literal("plan"),
        plan: queryPlanSchema,
      })
      .strict()
      .openapi("AskStreamEventPlan"),
    z
      .object({
        type: z.literal("tool_result"),
        result: toolResultSchema,
      })
      .strict()
      .openapi("AskStreamEventToolResult"),
    z
      .object({
        type: z.literal("evidence"),
        evidence: evidenceSchema,
      })
      .strict()
      .openapi("AskStreamEventEvidence"),
    z
      .object({
        type: z.literal("delta"),
        field: z.enum(["observations", "interpretation"]),
        text: z.string().max(2000),
      })
      .strict()
      .openapi("AskStreamEventDelta"),
    z
      .object({
        type: z.literal("answer"),
        answer: answerSchema,
      })
      .strict()
      .openapi("AskStreamEventAnswer"),
    z
      .object({
        type: z.literal("refusal"),
        code: askRefusalCodeSchema,
        message: z.string().trim().min(1).max(500),
        suggestions: z.array(z.string().trim().min(1).max(200)).max(5),
      })
      .strict()
      .openapi("AskStreamEventRefusal"),
    z
      .object({
        type: z.literal("error"),
        code: askErrorCodeSchema,
        message: z.string().trim().min(1).max(500),
      })
      .strict()
      .openapi("AskStreamEventError"),
    z
      .object({
        type: z.literal("done"),
        runId: z.string().uuid(),
      })
      .strict()
      .openapi("AskStreamEventDone"),
  ])
  .openapi("AskStreamEvent");

export type AskRangePreset = z.infer<typeof askRangePresetSchema>;
export type AskPrimaryRangePreset = z.infer<typeof askPrimaryRangePresetSchema>;
export type AskToolName = z.infer<typeof askToolNameSchema>;
export type AskIntent = z.infer<typeof askIntentSchema>;
export type QueryPlanStep = z.infer<typeof queryPlanStepSchema>;
export type QueryPlan = z.infer<typeof queryPlanSchema>;
export type ToolResult = z.infer<typeof toolResultSchema>;
export type ObservedFact = z.infer<typeof observedFactSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Answer = z.infer<typeof answerSchema>;
export type AskRefusalCode = z.infer<typeof askRefusalCodeSchema>;
export type AskErrorCode = z.infer<typeof askErrorCodeSchema>;
export type AskStreamEvent = z.infer<typeof askStreamEventSchema>;
