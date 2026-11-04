import type {
  ActionSpec,
  AuthSpec,
  Connector,
  ConnectorContext,
  ConnectorMetadata,
  HealthResult,
  MetricQuery,
  MetricResult,
  Resource,
  ToolSpec,
} from "@marketing-os/connector-sdk";
import { ConnectorError } from "@marketing-os/connector-sdk";

export class MockConnector implements Connector {
  metadata(): ConnectorMetadata {
    return {
      slug: "mock",
      name: "Mock Connector",
      version: "0.0.1",
      description: "Deterministic fixtures for local and CI journeys",
      capabilities: ["read"],
    };
  }

  authSpec(): AuthSpec {
    return { type: "none", scopes: ["campaigns", "leads"] };
  }

  async listResources(_ctx: ConnectorContext): Promise<Resource[]> {
    void _ctx;
    return [
      { name: "campaigns", kind: "campaign", description: "Mock campaigns" },
      { name: "leads", kind: "lead", description: "Mock leads" },
    ];
  }

  async describeSchema(_ctx: ConnectorContext, resource: string): Promise<Record<string, unknown>> {
    if (resource === "campaigns") {
      return {
        fields: [
          { name: "id", type: "string" },
          { name: "name", type: "string" },
          { name: "impressions", type: "number" },
        ],
      };
    }
    if (resource === "leads") {
      return {
        fields: [
          { name: "id", type: "string" },
          { name: "email", type: "string" },
        ],
      };
    }
    throw new ConnectorError(`Unknown resource ${resource}`, "not_found");
  }

  async queryMetrics(_ctx: ConnectorContext, query: MetricQuery): Promise<MetricResult[]> {
    if (_ctx.credentials["fail"] === "1") {
      throw new ConnectorError("Injected failure", "provider_error", true);
    }
    const seed = query.metric === "impressions" ? 1200 : 42;
    return [
      {
        metric: query.metric,
        value: seed,
        unit: query.metric === "impressions" ? "count" : undefined,
        lineage: {
          source: "mock",
          fetchedAt: new Date().toISOString(),
          definitionVersion: "1",
        },
      },
    ];
  }

  async health(_ctx: ConnectorContext): Promise<HealthResult> {
    if (_ctx.credentials["unhealthy"] === "1") {
      return {
        status: "error",
        checkedAt: new Date().toISOString(),
        message: "Injected unhealthy state",
      };
    }
    return { status: "ok", checkedAt: new Date().toISOString(), message: "Mock healthy" };
  }

  async listTools(ctx: ConnectorContext): Promise<ToolSpec[]> {
    void ctx;
    return [{ name: "list_campaigns", description: "List mock campaigns", risk: "low" }];
  }

  async listActions(ctx: ConnectorContext): Promise<ActionSpec[]> {
    void ctx;
    return [
      {
        name: "noop",
        risk: "low",
        requiresApproval: false,
        idempotencyRequired: true,
        supportsRollback: false,
      },
    ];
  }
}

export const mockConnector = new MockConnector();
