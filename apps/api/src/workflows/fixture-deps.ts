import { FakeGateway } from "@marketing-os/model-gateway";
import type { WorkflowDeps } from "@marketing-os/workflow/interpreter";
import type { ConfigWorkflowFixture } from "./params";

/** Rebuilds interpreter deps from a serializable ConfigWorkflow fixture. */
export function depsFromFixture(fixture: ConfigWorkflowFixture): WorkflowDeps {
  // Re-queue the same reply so Cloudflare step.do retries stay deterministic.
  const gateway = new FakeGateway({
    models: [
      {
        id: fixture.modelId,
        displayName: fixture.modelId,
        provider: "openai_compatible",
        inputPriceMicroUsdPer1M: 1_000_000,
        outputPriceMicroUsdPer1M: 2_000_000,
      },
    ],
    completeScripts: Array.from({ length: 8 }, () => ({ content: fixture.modelReply })),
  });

  return {
    model: fixture.modelId,
    gateway,
    listActions: async () => {
      throw new Error("listActions must not run in Sprint 4");
    },
    executeAction: async () => {
      throw new Error("connector must not run");
    },
    async writeRecommendation() {
      // The weekly review fixture has no threshold step.
    },
    reader: {
      async metricValue(query) {
        if (query.metricKey !== "mock.spend") {
          return { metricKey: query.metricKey, status: "no_data", value: null, unit: null };
        }
        return {
          metricKey: query.metricKey,
          status: "ok",
          value: fixture.spend.current,
          unit: fixture.spend.unit,
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
          current: fixture.spend.current,
          previous: fixture.spend.previous,
          delta: fixture.spend.delta,
          unit: fixture.spend.unit,
        };
      },
    },
    async loadBusinessProfile() {
      return fixture.business;
    },
    async loadBrandProfile() {
      return null;
    },
    async loadPublishedSkill(_tenantId, _workspaceId, name, version) {
      if (name === fixture.skill.name && version === fixture.skill.version) {
        return fixture.skill;
      }
      return null;
    },
    async retrieveKnowledge() {
      return { chunks: [], deniedSourceIds: [] };
    },
    async recordAudit() {
      // Parity fixture does not persist audit rows.
    },
  };
}
