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

const DAY_MS = 24 * 60 * 60 * 1000;

export const MOCK_ACCOUNTS = [
  { id: "mock-account-1", name: "Demo Ads Account" },
  { id: "mock-account-2", name: "Demo Analytics Property" },
] as const;

/** Fixed per-day values so the same query window always returns the same numbers. */
const MOCK_METRICS: Record<string, { perDay: number; unit: string }> = {
  impressions: { perDay: 1200, unit: "count" },
  spend: { perDay: 85, unit: "EUR" },
  sessions: { perDay: 340, unit: "count" },
  conversions: { perDay: 12, unit: "count" },
  leads: { perDay: 4, unit: "count" },
};

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
      ...MOCK_ACCOUNTS.map((account) => ({ name: account.id, kind: "account", description: account.name })),
      { name: "campaigns", kind: "campaign", description: "Mock campaigns" },
      { name: "leads", kind: "lead", description: "Mock leads" },
    ];
  }

  async describeSchema(_ctx: ConnectorContext, resource: string): Promise<Record<string, unknown>> {
    if (MOCK_ACCOUNTS.some((account) => account.id === resource)) {
      return {
        fields: [
          { name: "id", type: "string" },
          { name: "name", type: "string" },
          { name: "currency", type: "string" },
        ],
      };
    }
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
    const definition = MOCK_METRICS[query.metric];
    if (!definition) {
      throw new ConnectorError(`Unknown metric ${query.metric}`, "not_found");
    }
    const days = Math.max(1, Math.round((Date.parse(query.to) - Date.parse(query.from)) / DAY_MS));
    return [
      {
        metric: query.metric,
        value: definition.perDay * days,
        unit: definition.unit,
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
