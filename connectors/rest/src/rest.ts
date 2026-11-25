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
import { assertRestGetMethod, assertSafeRestUrl } from "./endpoint-guard";

/** Platform catalog keys this connector writes on each sync window. */
export const REST_METRICS = ["rest.value"] as const;

type FetchLike = typeof fetch;

export type RestConnectorOptions = {
  fetch?: FetchLike;
};

/**
 * Read-only HTTPS GET connector. Credentials come from the keyring map:
 * `base_url` (required), optional `bearer_token` or `api_key` (+ `api_key_header`).
 */
export class RestConnector implements Connector {
  constructor(private readonly options: RestConnectorOptions = {}) {}

  metadata(): ConnectorMetadata {
    return {
      slug: "rest",
      name: "Generic REST",
      version: "0.1.0",
      description: "Read-only HTTPS GET metrics from a customer HTTPS endpoint",
      capabilities: ["read"],
    };
  }

  authSpec(): AuthSpec {
    return { type: "api_key", scopes: ["metrics"] };
  }

  async listResources(ctx: ConnectorContext): Promise<Resource[]> {
    const base = this.baseUrl(ctx);
    return [{ name: base.host, kind: "account", description: `REST host ${base.host}` }];
  }

  async describeSchema(_ctx: ConnectorContext, resource: string): Promise<Record<string, unknown>> {
    if (!resource) throw new ConnectorError("Unknown resource", "not_found");
    return {
      fields: [
        { name: "value", type: "number" },
        { name: "unit", type: "string" },
      ],
    };
  }

  async queryMetrics(ctx: ConnectorContext, query: MetricQuery): Promise<MetricResult[]> {
    const metric = normalizeMetric(query.metric);
    if (!metric) {
      throw new ConnectorError(`Unknown metric ${query.metric}`, "not_found");
    }
    const base = this.baseUrl(ctx);
    const url = new URL("/metrics/value", base);
    url.searchParams.set("from", query.from);
    url.searchParams.set("to", query.to);
    const body = await this.getJson(ctx, url);
    const value = readNumericValue(body);
    if (value === null) {
      throw new ConnectorError("REST response did not include a numeric value", "provider_error", true);
    }
    const unit = typeof body.unit === "string" ? body.unit : "count";
    return [
      {
        metric: query.metric,
        value,
        unit,
        lineage: {
          source: "rest",
          fetchedAt: new Date().toISOString(),
          definitionVersion: "1",
        },
      },
    ];
  }

  async health(ctx: ConnectorContext): Promise<HealthResult> {
    const checkedAt = new Date().toISOString();
    try {
      const base = this.baseUrl(ctx);
      const url = new URL("/health", base);
      await this.getJson(ctx, url);
      return { status: "ok", checkedAt, message: "REST endpoint reachable" };
    } catch (error) {
      return {
        status: "error",
        checkedAt,
        message: error instanceof Error ? error.message : "health failed",
      };
    }
  }

  async listTools(_ctx: ConnectorContext): Promise<ToolSpec[]> {
    void _ctx;
    return [
      {
        name: "fetch_value",
        description: "GET a numeric metric from the configured HTTPS endpoint",
        risk: "low",
      },
    ];
  }

  async listActions(_ctx: ConnectorContext): Promise<ActionSpec[]> {
    void _ctx;
    return [];
  }

  /**
   * Exposed for tests that exercise method refusal without going through queryMetrics.
   * Production paths always call GET.
   */
  async request(
    ctx: ConnectorContext,
    method: string,
    path: string,
  ): Promise<Response> {
    assertRestGetMethod(method);
    const base = this.baseUrl(ctx);
    const url = new URL(path, base);
    return this.rawGet(ctx, url);
  }

  private baseUrl(ctx: ConnectorContext): URL {
    const raw = ctx.credentials["base_url"];
    if (!raw) {
      throw new ConnectorError("REST connector requires base_url credentials", "auth_failed");
    }
    return assertSafeRestUrl(raw);
  }

  private async getJson(ctx: ConnectorContext, url: URL): Promise<Record<string, unknown>> {
    const response = await this.rawGet(ctx, url);
    if (!response.ok) {
      throw new ConnectorError(`REST GET failed with ${response.status}`, "provider_error", true);
    }
    const json = (await response.json()) as unknown;
    if (!json || typeof json !== "object" || Array.isArray(json)) {
      throw new ConnectorError("REST response must be a JSON object", "provider_error", true);
    }
    return json as Record<string, unknown>;
  }

  private async rawGet(ctx: ConnectorContext, url: URL): Promise<Response> {
    assertSafeRestUrl(url.toString());
    assertRestGetMethod("GET");
    const headers = new Headers({ accept: "application/json" });
    const bearer = ctx.credentials["bearer_token"];
    const apiKey = ctx.credentials["api_key"];
    if (bearer) {
      headers.set("authorization", `Bearer ${bearer}`);
    } else if (apiKey) {
      const headerName = ctx.credentials["api_key_header"] ?? "x-api-key";
      headers.set(headerName, apiKey);
    }
    const fetchImpl = this.options.fetch ?? fetch;
    return fetchImpl(url.toString(), {
      method: "GET",
      headers,
      redirect: "error",
    });
  }
}

function normalizeMetric(metric: string): string | null {
  if (metric === "rest.value" || metric === "value" || metric === "impressions") {
    return "rest.value";
  }
  return null;
}

function readNumericValue(body: Record<string, unknown>): number | null {
  if (typeof body.value === "number" && Number.isFinite(body.value)) return body.value;
  if (body.metrics && typeof body.metrics === "object" && !Array.isArray(body.metrics)) {
    const nested = body.metrics as Record<string, unknown>;
    if (typeof nested.value === "number" && Number.isFinite(nested.value)) return nested.value;
  }
  return null;
}

export const restConnector = new RestConnector();
