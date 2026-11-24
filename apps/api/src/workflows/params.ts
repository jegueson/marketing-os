import type {
  BusinessProfile,
  SkillDefinition,
  WorkflowDefinition,
} from "@marketing-os/schemas";

/**
 * Serializable payload for ConfigWorkflow.
 * Fixture mode rebuilds FakeGateway deps inside the Worker (Miniflare / local).
 * Production later loads profiles and skills from the database instead.
 */
export type ConfigWorkflowFixture = {
  skill: SkillDefinition;
  business: BusinessProfile;
  spend: {
    current: number;
    previous: number;
    delta: number;
    unit: string;
  };
  modelId: string;
  modelReply: string;
};

export type ConfigWorkflowParams = {
  tenantId: string;
  workspaceId: string;
  workflowId: string;
  workflowVersion: number;
  definition: WorkflowDefinition;
  fixture: ConfigWorkflowFixture;
};
