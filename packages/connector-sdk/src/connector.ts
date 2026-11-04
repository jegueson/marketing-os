import type {
  ActionSpec,
  AuthSpec,
  ConnectorMetadata,
  HealthResult,
  MetricQuery,
  MetricResult,
  Resource,
  ToolSpec,
} from "./models";

export type ConnectorContext = {
  tenantId: string;
  workspaceId: string;
  connectionId: string;
  credentials: Record<string, string>;
};

export interface Connector {
  metadata(): ConnectorMetadata;
  authSpec(): AuthSpec;
  listResources(ctx: ConnectorContext): Promise<Resource[]>;
  describeSchema(ctx: ConnectorContext, resource: string): Promise<Record<string, unknown>>;
  queryMetrics(ctx: ConnectorContext, query: MetricQuery): Promise<MetricResult[]>;
  health(ctx: ConnectorContext): Promise<HealthResult>;
  listTools(ctx: ConnectorContext): Promise<ToolSpec[]>;
  listActions(ctx: ConnectorContext): Promise<ActionSpec[]>;
}
