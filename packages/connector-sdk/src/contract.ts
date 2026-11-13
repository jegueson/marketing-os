import { expect } from "vitest";
import type { Connector } from "./connector";
import {
  actionSpecSchema,
  authSpecSchema,
  connectorMetadataSchema,
  healthResultSchema,
  metricResultSchema,
  resourceSchema,
  toolSpecSchema,
} from "./models";

export type ConnectorContractOptions = {
  /** Metric the kit queries. Defaults to the mock probe metric. */
  metric?: string;
  dimensions?: string[];
  credentials?: Record<string, string>;
};

/** Contract kit: every connector must pass these checks. */
export async function runConnectorContract(
  connector: Connector,
  options: ConnectorContractOptions = {},
): Promise<void> {
  const ctx = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    workspaceId: "22222222-2222-2222-2222-222222222222",
    connectionId: "33333333-3333-3333-3333-333333333333",
    credentials: options.credentials ?? {},
  };
  const meta = connectorMetadataSchema.parse(connector.metadata());
  expect(meta.slug.length).toBeGreaterThan(0);
  authSpecSchema.parse(connector.authSpec());

  const resources = await connector.listResources(ctx);
  expect(resources.length).toBeGreaterThan(0);
  for (const resource of resources) {
    resourceSchema.parse(resource);
  }

  const schema = await connector.describeSchema(ctx, resources[0]!.name);
  expect(schema).toBeTypeOf("object");

  const now = new Date();
  const from = new Date(now.getTime() - 86_400_000).toISOString();
  const to = now.toISOString();
  const metrics = await connector.queryMetrics(ctx, {
    metric: options.metric ?? "impressions",
    dimensions: options.dimensions ?? [],
    from,
    to,
  });
  expect(metrics.length).toBeGreaterThan(0);
  for (const metric of metrics) {
    metricResultSchema.parse(metric);
  }

  healthResultSchema.parse(await connector.health(ctx));
  for (const tool of await connector.listTools(ctx)) {
    toolSpecSchema.parse(tool);
  }
  for (const action of await connector.listActions(ctx)) {
    actionSpecSchema.parse(action);
  }
}
