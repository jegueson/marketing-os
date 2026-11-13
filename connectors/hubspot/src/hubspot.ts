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
import { HUBSPOT_AUTHORIZATION_URL, HUBSPOT_SCOPES, HUBSPOT_TOKEN_URL } from "./oauth";

const API = "https://api.hubapi.com";
/** Date-versioned CRM search paths from the HubSpot public API spec. */
const CRM = `${API}/crm/objects/2026-09-beta`;
const PORTAL_ID = /^portals\/(\d+)$/;

/** Default pipeline stages that count as a qualified deal. Unqualified and lost stages stay out. */
export const QUALIFIED_DEAL_STAGES = [
  "qualifiedtobuy",
  "presentationscheduled",
  "decisionmakerboughtin",
  "contractsent",
  "closedwon",
] as const;

/** Platform catalog keys this connector writes on each sync window. */
export const HUBSPOT_METRICS = ["hubspot.contacts_created", "hubspot.deals_qualified"] as const;

type MetricName = (typeof HUBSPOT_METRICS)[number] | "contacts_created" | "deals_qualified";

const METRIC_UNITS: Record<MetricName, string> = {
  "hubspot.contacts_created": "count",
  contacts_created: "count",
  "hubspot.deals_qualified": "count",
  deals_qualified: "count",
};

export class HubSpotConnector implements Connector {
  constructor(private readonly options: { fetch?: typeof fetch } = {}) {}

  metadata(): ConnectorMetadata {
    return {
      slug: "hubspot",
      name: "HubSpot",
      version: "0.1.0",
      description: "Read-only sandbox contacts and qualified deals",
      capabilities: ["read", "oauth"],
    };
  }

  authSpec(): AuthSpec {
    return {
      type: "oauth2",
      scopes: [...HUBSPOT_SCOPES],
      authorizationUrl: HUBSPOT_AUTHORIZATION_URL,
      tokenUrl: HUBSPOT_TOKEN_URL,
    };
  }

  async listResources(ctx: ConnectorContext): Promise<Resource[]> {
    const portal = await this.portal(ctx);
    return [{ name: portal.id, kind: "account", description: portal.name }];
  }

  async describeSchema(_ctx: ConnectorContext, resource: string): Promise<Record<string, unknown>> {
    if (!PORTAL_ID.test(resource)) throw new ConnectorError(`Unknown resource ${resource}`, "not_found");
    return {
      fields: [
        { name: "portalId", type: "string" },
        { name: "createdate", type: "string" },
        { name: "dealstage", type: "string" },
      ],
    };
  }

  async queryMetrics(ctx: ConnectorContext, query: MetricQuery): Promise<MetricResult[]> {
    const metric = normalizeMetric(query.metric);
    const selected = query.dimensions.filter((id) => PORTAL_ID.test(id));
    if (selected.length === 0) throw new ConnectorError("Select a HubSpot account before syncing", "invalid_input");
    const portal = await this.portal(ctx);
    if (!selected.includes(portal.id)) throw new ConnectorError("HubSpot portal is not the selected account", "permission_changed");
    const start = Date.parse(query.from);
    const end = Date.parse(query.to) - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) throw new ConnectorError("Metric window is empty", "invalid_input");
    const total = metric === "hubspot.contacts_created" ? await this.countContacts(ctx, start, end) : await this.countQualifiedDeals(ctx, start, end);
    return [
      {
        metric: query.metric,
        value: total,
        unit: METRIC_UNITS[metric],
        lineage: { source: "hubspot", fetchedAt: new Date().toISOString(), definitionVersion: "1" },
      },
    ];
  }

  async health(ctx: ConnectorContext): Promise<HealthResult> {
    const checkedAt = new Date().toISOString();
    try {
      await this.portal(ctx);
      return { status: "ok", checkedAt, message: "HubSpot portal is readable" };
    } catch (err) {
      return { status: "error", checkedAt, message: err instanceof ConnectorError ? err.message : "HubSpot health check failed" };
    }
  }

  async listTools(ctx: ConnectorContext): Promise<ToolSpec[]> {
    void ctx;
    return [{ name: "list_portals", description: "List the HubSpot portal this connection can read", risk: "low" }];
  }

  async listActions(ctx: ConnectorContext): Promise<ActionSpec[]> {
    void ctx;
    return [];
  }

  private fetch(): typeof fetch {
    return this.options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async portal(ctx: ConnectorContext): Promise<{ id: string; name: string }> {
    const payload = await this.send(ctx, `${API}/account-info/v3/details`);
    const portalId = payload.portalId;
    if (typeof portalId !== "number" && typeof portalId !== "string") {
      throw new ConnectorError("HubSpot returned an unexpected payload", "provider_error");
    }
    const id = `portals/${portalId}`;
    if (!PORTAL_ID.test(id)) throw new ConnectorError("HubSpot returned an unexpected payload", "provider_error");
    const sandbox = payload.accountType === "SANDBOX";
    return { id, name: sandbox ? "Sandbox portal" : "HubSpot portal" };
  }

  private async countContacts(ctx: ConnectorContext, start: number, end: number): Promise<number> {
    const payload = await this.send(ctx, `${CRM}/contacts/search`, JSON.stringify(searchBody(start, end)));
    return totalOf(payload);
  }

  private async countQualifiedDeals(ctx: ConnectorContext, start: number, end: number): Promise<number> {
    const payload = await this.send(
      ctx,
      `${CRM}/deals/search`,
      JSON.stringify(searchBody(start, end, { propertyName: "dealstage", operator: "IN", values: [...QUALIFIED_DEAL_STAGES] })),
    );
    return totalOf(payload);
  }

  private async send(ctx: ConnectorContext, url: string, body?: string): Promise<Record<string, unknown>> {
    const headers = requestHeaders(ctx, Boolean(body));
    let response: Response;
    try {
      response = await this.fetch()(url, {
        method: body ? "POST" : "GET",
        headers,
        ...(body ? { body } : {}),
      });
    } catch {
      throw new ConnectorError("HubSpot request failed", "provider_error", true);
    }
    if (!response.ok) {
      await response.text();
      throw mapStatus(response.status);
    }
    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null) throw new ConnectorError("HubSpot returned an unexpected payload", "provider_error");
    return payload as Record<string, unknown>;
  }
}

export const hubspotConnector = new HubSpotConnector();

function normalizeMetric(metric: string): MetricName {
  if (metric === "contacts_created" || metric === "hubspot.contacts_created") return "hubspot.contacts_created";
  if (metric === "deals_qualified" || metric === "hubspot.deals_qualified") return "hubspot.deals_qualified";
  throw new ConnectorError(`Unknown metric ${metric}`, "not_found");
}

function searchBody(start: number, end: number, extra?: { propertyName: string; operator: string; values: string[] }): Record<string, unknown> {
  const filters: Record<string, unknown>[] = [
    { propertyName: "createdate", operator: "BETWEEN", value: String(start), highValue: String(end) },
  ];
  if (extra) filters.push(extra);
  return { filterGroups: [{ filters }], properties: extra ? ["dealstage"] : ["createdate"], limit: 1 };
}

function requestHeaders(ctx: ConnectorContext, json: boolean): Record<string, string> {
  const token = ctx.credentials.access_token ?? "";
  if (!token || /[\r\n]/.test(token)) throw new ConnectorError("HubSpot access token is missing", "auth_failed");
  const headers: Record<string, string> = { authorization: `Bearer ${token}`, accept: "application/json" };
  if (json) headers["content-type"] = "application/json";
  return headers;
}

function mapStatus(status: number): ConnectorError {
  if (status === 401) return new ConnectorError("HubSpot access token was rejected", "auth_expired");
  if (status === 403) return new ConnectorError("HubSpot permission was denied", "permission_changed");
  if (status === 429) return new ConnectorError("HubSpot rate limit reached", "rate_limited", true);
  if (status === 404) return new ConnectorError("HubSpot portal was not found", "not_found");
  if (status >= 500) return new ConnectorError("HubSpot request failed", "provider_error", true);
  return new ConnectorError("HubSpot request was rejected", "invalid_input");
}

function totalOf(payload: Record<string, unknown>): number {
  const total = typeof payload.total === "number" ? payload.total : Number(payload.total);
  if (!Number.isFinite(total)) throw new ConnectorError("HubSpot returned an unexpected payload", "provider_error");
  return total;
}
