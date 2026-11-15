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
import { GA4_AUTHORIZATION_URL, GA4_SCOPES, GA4_TOKEN_URL } from "./oauth";

const ADMIN_URL = "https://analyticsadmin.googleapis.com/v1beta/accountSummaries";
const DATA_ORIGIN = "https://analyticsdata.googleapis.com/v1beta";
const PROPERTY_ID = /^properties\/\d+$/;

/** Platform catalog keys this connector writes on each sync window. */
export const GA4_METRICS = ["ga4.sessions", "ga4.key_events"] as const;

const METRIC_NAMES: Record<string, string> = {
  "ga4.sessions": "sessions",
  sessions: "sessions",
  "ga4.key_events": "keyEvents",
  key_events: "keyEvents",
};

type AccountSummary = {
  account?: string;
  displayName?: string;
  propertySummaries?: { property?: string; displayName?: string }[];
};

export class Ga4Connector implements Connector {
  constructor(private readonly options: { fetch?: typeof fetch } = {}) {}

  metadata(): ConnectorMetadata {
    return {
      slug: "google-analytics",
      name: "Google Analytics 4",
      version: "0.1.0",
      description: "Read-only GA4 properties, sessions, and key events",
      capabilities: ["read", "oauth"],
    };
  }

  authSpec(): AuthSpec {
    return {
      type: "oauth2",
      scopes: [...GA4_SCOPES],
      authorizationUrl: GA4_AUTHORIZATION_URL,
      tokenUrl: GA4_TOKEN_URL,
    };
  }

  async listResources(ctx: ConnectorContext): Promise<Resource[]> {
    const resources: Resource[] = [];
    const seen = new Set<string>();
    let pageToken = "";
    for (let page = 0; page < 10; page += 1) {
      const url = new URL(ADMIN_URL);
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const payload = await this.getJson(ctx, url);
      const summaries = Array.isArray(payload.accountSummaries) ? payload.accountSummaries : [];
      for (const summary of summaries) {
        if (!isAccountSummary(summary) || !summary.account) continue;
        resources.push({ name: summary.account, kind: "account", description: summary.displayName ?? summary.account });
        for (const property of summary.propertySummaries ?? []) {
          if (!property.property || !PROPERTY_ID.test(property.property)) continue;
          resources.push({
            name: property.property,
            kind: "property",
            description: property.displayName ?? property.property,
            parentId: summary.account,
          });
        }
      }
      const next = typeof payload.nextPageToken === "string" ? payload.nextPageToken : "";
      if (!next || seen.has(next)) break;
      seen.add(next);
      pageToken = next;
    }
    return resources;
  }

  async describeSchema(_ctx: ConnectorContext, resource: string): Promise<Record<string, unknown>> {
    if (resource.startsWith("accounts/")) {
      return { fields: [{ name: "account", type: "string" }, { name: "displayName", type: "string" }] };
    }
    if (PROPERTY_ID.test(resource)) {
      return {
        fields: [
          { name: "property", type: "string" },
          { name: "sessions", type: "number" },
          { name: "keyEvents", type: "number" },
        ],
      };
    }
    throw new ConnectorError(`Unknown resource ${resource}`, "not_found");
  }

  async queryMetrics(ctx: ConnectorContext, query: MetricQuery): Promise<MetricResult[]> {
    const ga4Name = METRIC_NAMES[query.metric];
    if (!ga4Name) throw new ConnectorError(`Unknown metric ${query.metric}`, "not_found");
    const properties = query.dimensions.filter((id) => PROPERTY_ID.test(id));
    if (properties.length === 0) {
      throw new ConnectorError("Select a GA4 property before syncing", "invalid_input");
    }
    const startDate = utcDate(query.from);
    const endDate = utcDate(new Date(Date.parse(query.to) - 1).toISOString());
    if (endDate < startDate) throw new ConnectorError("Metric window is empty", "invalid_input");
    let total = 0;
    for (const property of properties) {
      const payload = await this.postJson(ctx, `${DATA_ORIGIN}/${property}:runReport`, {
        dateRanges: [{ startDate, endDate }],
        metrics: [{ name: ga4Name }],
      });
      total += reportTotal(payload);
    }
    return [
      {
        metric: query.metric,
        value: total,
        unit: "count",
        lineage: {
          source: "ga4",
          fetchedAt: new Date().toISOString(),
          definitionVersion: "1",
        },
      },
    ];
  }

  async health(ctx: ConnectorContext): Promise<HealthResult> {
    const checkedAt = new Date().toISOString();
    try {
      await this.getJson(ctx, new URL(ADMIN_URL));
      return { status: "ok", checkedAt, message: "GA4 property list is readable" };
    } catch (err) {
      return {
        status: "error",
        checkedAt,
        message: err instanceof ConnectorError ? err.message : "GA4 health check failed",
      };
    }
  }

  async listTools(ctx: ConnectorContext): Promise<ToolSpec[]> {
    void ctx;
    return [{ name: "list_properties", description: "List GA4 properties the connection can read", risk: "low" }];
  }

  async listActions(ctx: ConnectorContext): Promise<ActionSpec[]> {
    void ctx;
    return [];
  }

  private fetch(): typeof fetch {
    return this.options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async getJson(ctx: ConnectorContext, url: URL): Promise<Record<string, unknown>> {
    return this.send(ctx, url.toString());
  }

  private async postJson(ctx: ConnectorContext, url: string, body: unknown): Promise<Record<string, unknown>> {
    return this.send(ctx, url, JSON.stringify(body));
  }

  private async send(ctx: ConnectorContext, url: string, body?: string): Promise<Record<string, unknown>> {
    const token = accessToken(ctx);
    let response: Response;
    try {
      response = await this.fetch()(url, {
        method: body ? "POST" : "GET",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body } : {}),
      });
    } catch {
      throw new ConnectorError("GA4 request failed", "provider_error", true);
    }
    if (!response.ok) {
      await response.text();
      throw mapStatus(response.status);
    }
    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null) {
      throw new ConnectorError("GA4 returned an unexpected payload", "provider_error");
    }
    return payload as Record<string, unknown>;
  }
}

export const ga4Connector = new Ga4Connector();

function accessToken(ctx: ConnectorContext): string {
  const token = ctx.credentials.access_token ?? "";
  if (!token || /[\r\n]/.test(token)) throw new ConnectorError("GA4 access token is missing", "auth_failed");
  return token;
}

function mapStatus(status: number): ConnectorError {
  if (status === 401) return new ConnectorError("GA4 access token was rejected", "auth_expired");
  if (status === 403) return new ConnectorError("GA4 permission was denied", "permission_changed");
  if (status === 429) return new ConnectorError("GA4 rate limit reached", "rate_limited", true);
  if (status === 404) return new ConnectorError("GA4 property was not found", "not_found");
  if (status >= 500) return new ConnectorError("GA4 request failed", "provider_error", true);
  return new ConnectorError("GA4 request was rejected", "invalid_input");
}

function isAccountSummary(value: unknown): value is AccountSummary {
  return typeof value === "object" && value !== null;
}

function reportTotal(payload: Record<string, unknown>): number {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  let total = 0;
  for (const row of rows) {
    if (typeof row !== "object" || row === null || !("metricValues" in row) || !Array.isArray(row.metricValues)) continue;
    const raw = row.metricValues[0];
    const value = typeof raw === "object" && raw !== null && "value" in raw ? Number(raw.value) : Number.NaN;
    if (!Number.isFinite(value)) throw new ConnectorError("GA4 returned an unexpected payload", "provider_error");
    total += value;
  }
  return total;
}

function utcDate(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) throw new ConnectorError("Metric window is invalid", "invalid_input");
  return new Date(parsed).toISOString().slice(0, 10);
}
