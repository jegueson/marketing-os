import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FakeGateway } from "@marketing-os/model-gateway";
import {
  businessProfileSchema,
  skillDefinitionSchema,
  workflowDefinitionSchema,
  type BusinessProfile,
  type SkillDefinition,
  type WorkflowDefinition,
} from "@marketing-os/schemas";
import { parse as parseYaml } from "yaml";
import type { WorkflowDeps } from "../interpreter";

/** Number a malicious model might invent; must never appear in the report. */
export const WEEKLY_REVIEW_HALLUCINATED = 999_999;

function repoRoot(): string {
  // Lazy: Workers bundles must not evaluate import.meta.url at module load.
  const here = dirname(fileURLToPath(import.meta.url));
  // fixtures → src → workflow → packages → repo root
  return join(here, "../../../..");
}

export type WeeklyReviewSpend = {
  current: number;
  previous: number;
  delta: number;
  unit: string;
};

export type WeeklyReviewFixtures = {
  skill: SkillDefinition;
  workflow: WorkflowDefinition;
  business: BusinessProfile;
  spend: WeeklyReviewSpend;
};

function readRepoText(...segments: string[]): string {
  return readFileSync(join(repoRoot(), ...segments), "utf8");
}

/** Loads the committed weekly-performance-review example from disk. */
export function loadWeeklyReviewFixtures(): WeeklyReviewFixtures {
  const skill = skillDefinitionSchema.parse(
    parseYaml(readRepoText("skills/starter/weekly-performance-review/skill.yaml")),
  );
  const workflow = workflowDefinitionSchema.parse(
    parseYaml(
      readRepoText("customer-configs/examples/weekly-performance-review/workflow.yaml"),
    ),
  );
  const business = businessProfileSchema.parse(
    parseYaml(
      readRepoText("customer-configs/examples/weekly-performance-review/business-profile.yaml"),
    ),
  );
  const metrics = JSON.parse(
    readRepoText("customer-configs/examples/weekly-performance-review/fixture-metrics.json"),
  ) as { "mock.spend": WeeklyReviewSpend };
  return { skill, workflow, business, spend: metrics["mock.spend"] };
}

export type WeeklyReviewFixtureDepsOptions = {
  /** Override model reply JSON body. Defaults to a hallucinated value. */
  modelReply?: string;
  modelId?: string;
};

/**
 * Builds interpreter deps for the weekly review fixture.
 * Metric reads come only from fixture spend. listActions always throws.
 */
export function buildWeeklyReviewDeps(
  fixtures: WeeklyReviewFixtures,
  options: WeeklyReviewFixtureDepsOptions = {},
): WorkflowDeps {
  const modelId = options.modelId ?? "gpt-test";
  const modelReply =
    options.modelReply ??
    JSON.stringify({
      summary: "Spend moved with the observed value.",
      metricKey: "mock.spend",
      value: WEEKLY_REVIEW_HALLUCINATED,
    });
  const { skill, business, spend } = fixtures;
  const gateway = new FakeGateway({
    models: [
      {
        id: modelId,
        displayName: modelId,
        provider: "openai_compatible",
        inputPriceMicroUsdPer1M: 1_000_000,
        outputPriceMicroUsdPer1M: 2_000_000,
      },
    ],
    completeScripts: [{ content: modelReply }],
  });

  return {
    model: modelId,
    gateway,
    listActions: async () => {
      throw new Error("listActions must not run in Sprint 4");
    },
    reader: {
      async metricValue(query) {
        if (query.metricKey !== "mock.spend") {
          return { metricKey: query.metricKey, status: "no_data", value: null, unit: null };
        }
        return {
          metricKey: query.metricKey,
          status: "ok",
          value: spend.current,
          unit: spend.unit,
        };
      },
      async metricCompare(query) {
        if (query.metricKey !== "mock.spend") {
          return {
            metricKey: query.metricKey,
            status: "no_data",
            current: null,
            previous: null,
            delta: null,
            unit: null,
          };
        }
        return {
          metricKey: query.metricKey,
          status: "ok",
          current: spend.current,
          previous: spend.previous,
          delta: spend.delta,
          unit: spend.unit,
        };
      },
    },
    async loadBusinessProfile() {
      return business;
    },
    async loadBrandProfile() {
      return null;
    },
    async loadPublishedSkill(_tenantId, _workspaceId, name, version) {
      if (name === skill.name && version === skill.version) return skill;
      return null;
    },
  };
}
