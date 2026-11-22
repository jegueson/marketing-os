import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";
import { runAsk, type MetricReader, type ValidatedPlan } from "@marketing-os/ask";
import { FakeGateway, OpenRouterGateway, type ModelGateway } from "@marketing-os/model-gateway";
import { catalog } from "@marketing-os/prompts";
import type { AskStreamEvent } from "@marketing-os/schemas";

const coverageSchema = z
  .object({
    status: z.enum(["full", "partial", "no_data"]),
    requestedDays: z.number().int().nonnegative(),
    coveredDays: z.number().int().nonnegative(),
  })
  .strict();

const replayAnswerSchema = z
  .object({
    observations: z.array(z.string().min(1)).min(1),
    interpretation: z.string().min(1),
  })
  .strict();

const groups = [
  "single_metric",
  "period_compare",
  "ratio",
  "freshness",
  "follow_up",
  "unsupported_dimension",
  "out_of_scope",
  "clarification",
  "injection",
  "partial_coverage",
] as const;

export const askCaseSchema = z
  .object({
    id: z.string().trim().min(1),
    group: z.enum(groups),
    question: z.string().trim().min(1),
    catalog: z.array(z.string().min(1)).min(1),
    labels: z.record(z.string(), z.string()),
    now: z.string().datetime(),
    model: z.string().trim().min(1),
    workspaceId: z.string().uuid(),
    runId: z.string().uuid(),
    priorPlan: z.unknown().optional(),
    reader: z
      .object({
        metric: z.string().min(1),
        value: z.number().nullable(),
        unit: z.string().nullable(),
        source: z.string().nullable(),
        definitionVersion: z.string().nullable(),
        fetchedAt: z.string().datetime().nullable(),
        status: z.enum(["ok", "no_data"]).default("ok"),
        coverage: coverageSchema.optional(),
        compare: z
          .object({
            current: z.number(),
            previous: z.number().nullable(),
            delta: z.number().nullable(),
          })
          .strict()
          .optional(),
        health: z
          .array(
            z
              .object({
                connectionId: z.string().uuid(),
                connector: z.string().min(1),
                health: z.enum(["healthy", "stale", "error", "never_synced"]),
                message: z.string().nullable(),
                scopes: z.array(z.string()),
              })
              .strict(),
          )
          .optional(),
      })
      .strict(),
    replay: z
      .object({
        plan: z.record(z.string(), z.unknown()),
        answer: replayAnswerSchema.optional(),
      })
      .strict(),
    expect: z
      .object({
        observations: z.array(z.string()).optional(),
        interpretationIncludes: z.string().min(1).optional(),
        evidenceValue: z.number().optional(),
        refusal: z.string().min(1).optional(),
        message: z.string().min(1).optional(),
        warnings: z.array(z.string()).optional(),
        freshness: z.enum(["live", "stale", "empty", "error"]).optional(),
        forbidden: z.array(z.string().min(1)).optional(),
        modelCalls: z.number().int().nonnegative().optional(),
      })
      .strict(),
  })
  .strict();

export type AskCase = z.infer<typeof askCaseSchema>;

export type CaseScore = {
  id: string;
  model: string;
  pass: boolean;
  failures: string[];
};

export type Scorecard = {
  mode: "replay" | "live";
  model: string;
  prompts: { name: string; version: string }[];
  passed: number;
  failed: number;
  cases: CaseScore[];
};

const questionsDir = join(dirname(fileURLToPath(import.meta.url)), "../questions");

export function promptVersions(): { name: string; version: string }[] {
  return catalog
    .filter((prompt) => prompt.name === "ask.plan" || prompt.name === "ask.answer")
    .map((prompt) => ({ name: prompt.name, version: prompt.version }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function loadCases(dir = questionsDir): AskCase[] {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".yaml"))
    .sort();
  return files.map((name) => {
    const raw: unknown = parse(readFileSync(join(dir, name), "utf8"));
    const parsed = askCaseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`${name}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
    }
    return parsed.data;
  });
}

const BREAKOUT = /\b(campaigns?|channels?|creatives?)\b/i;
const FOLLOW_UP = /^(what about|how about|and|same)\b/i;

function emptyObservation(metricKey: string): Awaited<ReturnType<MetricReader["metricValue"]>> {
  return {
    metricKey,
    status: "no_data",
    value: null,
    unit: null,
    source: null,
    definitionVersion: null,
    fetchedAt: null,
    windows: [],
    scopes: [],
    coverage: { status: "no_data", requestedDays: 30, coveredDays: 0 },
  };
}

function readerFor(input: AskCase): MetricReader {
  const metric = input.reader;
  const full = { status: "full" as const, requestedDays: 30, coveredDays: 30 };
  return {
    async metricValue(query) {
      if (query.metricKey !== metric.metric || metric.status === "no_data" || metric.value == null || !metric.definitionVersion || !metric.source) {
        return emptyObservation(query.metricKey);
      }
      return {
        metricKey: query.metricKey,
        status: "ok",
        value: metric.value,
        unit: metric.unit,
        source: metric.source,
        definitionVersion: metric.definitionVersion,
        fetchedAt: metric.fetchedAt,
        windows: [{ start: "2026-03-02T00:00:00.000Z", end: "2026-04-01T00:00:00.000Z" }],
        scopes: ["mock-account-1"],
        coverage: metric.coverage ?? full,
      };
    },
    async metricCompare(query) {
      const compare = metric.compare;
      if (query.metricKey !== metric.metric || !compare || !metric.definitionVersion || !metric.source) {
        return {
          metricKey: query.metricKey,
          status: "no_data",
          current: null,
          previous: null,
          delta: null,
          source: null,
          definitionVersion: null,
          fetchedAt: null,
          windows: [],
          scopes: [],
        };
      }
      return {
        metricKey: query.metricKey,
        status: "ok",
        current: compare.current,
        previous: compare.previous,
        delta: compare.delta,
        source: metric.source,
        definitionVersion: metric.definitionVersion,
        fetchedAt: metric.fetchedAt,
        windows: [],
        scopes: ["mock-account-1"],
      };
    },
    async dataHealth() {
      return metric.health ?? [];
    },
    async listMetrics() {
      return [];
    },
  };
}

function scripts(input: AskCase): { content: string }[] {
  if (BREAKOUT.test(input.question)) return [];
  if (input.priorPlan && FOLLOW_UP.test(input.question.trim())) {
    return input.replay.answer ? [{ content: JSON.stringify(input.replay.answer) }] : [];
  }
  const planned = [{ content: JSON.stringify(input.replay.plan) }];
  if (input.replay.answer) planned.push({ content: JSON.stringify(input.replay.answer) });
  return planned;
}

function replayGateway(input: AskCase): FakeGateway {
  return new FakeGateway({
    models: [
      {
        id: input.model,
        displayName: input.model,
        provider: "openai_compatible",
        inputPriceMicroUsdPer1M: 1,
        outputPriceMicroUsdPer1M: 1,
      },
    ],
    completeScripts: scripts(input),
  });
}

async function collect(input: AskCase, gateway: ModelGateway): Promise<AskStreamEvent[]> {
  const events: AskStreamEvent[] = [];
  const priorPlan = input.priorPlan as ValidatedPlan | undefined;
  for await (const event of runAsk({
    question: input.question,
    catalog: input.catalog,
    model: input.model,
    gateway,
    reader: readerFor(input),
    workspaceId: input.workspaceId,
    runId: input.runId,
    now: new Date(input.now),
    labels: input.labels,
    ...(priorPlan ? { priorPlan } : {}),
  })) {
    events.push(event);
  }
  return events;
}

export function grade(input: AskCase, events: readonly AskStreamEvent[]): string[] {
  const failures: string[] = [];
  const answer = events.find((event) => event.type === "answer");
  const evidence = events.find((event) => event.type === "evidence");
  const refusal = events.find((event) => event.type === "refusal");
  const expected = input.expect;

  if (expected.refusal) {
    if (!refusal || refusal.type !== "refusal" || refusal.code !== expected.refusal) {
      const got = refusal && refusal.type === "refusal" ? refusal.code : "missing";
      failures.push(`refusal ${got} != ${expected.refusal}`);
    } else if (expected.message && refusal.message !== expected.message) {
      failures.push(`refusal message ${JSON.stringify(refusal.message)}`);
    }
    if (answer) failures.push("unexpected answer");
  } else if (!answer || answer.type !== "answer") {
    failures.push("missing answer");
  } else {
    if (expected.observations && JSON.stringify(answer.answer.observations) !== JSON.stringify(expected.observations)) {
      failures.push(`observations ${JSON.stringify(answer.answer.observations)} != ${JSON.stringify(expected.observations)}`);
    }
    if (expected.interpretationIncludes && !answer.answer.interpretation.includes(expected.interpretationIncludes)) {
      failures.push(`interpretation missing ${JSON.stringify(expected.interpretationIncludes)}`);
    }
  }

  if (expected.evidenceValue !== undefined) {
    const value = evidence && evidence.type === "evidence" ? evidence.evidence.observed[0]?.value : undefined;
    if (value !== expected.evidenceValue) failures.push(`evidence value ${String(value)} != ${expected.evidenceValue}`);
  }
  if (expected.warnings) {
    const got = evidence && evidence.type === "evidence" ? [...evidence.evidence.qualityWarnings].sort() : [];
    const want = [...expected.warnings].sort();
    if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`warnings ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
  }
  if (expected.freshness) {
    const got = evidence && evidence.type === "evidence" ? evidence.evidence.freshness : "missing";
    if (got !== expected.freshness) failures.push(`freshness ${got} != ${expected.freshness}`);
  }
  if (expected.forbidden) {
    const blob = JSON.stringify(events);
    for (const token of expected.forbidden) {
      if (blob.includes(token)) failures.push(`forbidden ${token}`);
    }
  }
  return failures;
}

function scorecard(mode: "replay" | "live", model: string, cases: CaseScore[]): Scorecard {
  const failed = cases.filter((item) => !item.pass).length;
  return {
    mode,
    model,
    prompts: promptVersions(),
    passed: cases.length - failed,
    failed,
    cases,
  };
}

export async function runReplay(cases: readonly AskCase[]): Promise<Scorecard> {
  const scored: CaseScore[] = [];
  for (const item of cases) {
    const gateway = replayGateway(item);
    const failures = grade(item, await collect(item, gateway));
    if (item.expect.modelCalls != null && gateway.calls.complete.length !== item.expect.modelCalls) {
      failures.push(`model calls ${gateway.calls.complete.length} != ${item.expect.modelCalls}`);
    }
    scored.push({ id: item.id, model: item.model, pass: failures.length === 0, failures });
  }
  return scorecard("replay", cases[0]?.model ?? "none", scored);
}

export async function runLive(
  cases: readonly AskCase[],
  env: { MOS_EVAL_MODEL_KEY?: string | undefined; MOS_EVAL_MODEL?: string | undefined },
): Promise<Scorecard> {
  const key = env.MOS_EVAL_MODEL_KEY?.trim();
  if (!key) throw new Error("live eval requires MOS_EVAL_MODEL_KEY");
  const model = env.MOS_EVAL_MODEL?.trim() || cases[0]?.model || "openrouter/auto";
  const gateway = new OpenRouterGateway({ apiKey: key, deploymentMode: "cloud" });
  const scored: CaseScore[] = [];
  for (const item of cases) {
    const failures = grade({ ...item, model }, await collect({ ...item, model }, gateway));
    scored.push({ id: item.id, model, pass: failures.length === 0, failures });
  }
  return scorecard("live", model, scored);
}
