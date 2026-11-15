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
import { META_AUTHORIZATION_URL, META_GRAPH_VERSION, META_SCOPES, META_TOKEN_URL } from "./oauth";

const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const ACCOUNT_ID = /^act_\d+$/;

/** Platform catalog keys this connector writes on each sync window. */
export const META_METRICS = ["meta.spend", "meta.impressions"] as const;

type MetricName = (typeof META_METRICS)[number] | "spend" | "impressions";

const METRIC_FIELDS: Record<MetricName, { field: "spend" | "impressions"; unit: string }> = {
  "meta.spend": { field: "spend", unit: "currency" },
  spend: { field: "spend", unit: "currency" },
  "meta.impressions": { field: "impressions", unit: "count" },
  impressions: { field: "impressions", unit: "count" },
};

type AdAccount = { id: string; name: string };

export class MetaConnector implements Connector {
  constructor(private readonly options: { fetch?: typeof fetch } = {}) {}

  metadata(): ConnectorMetadata {
    return {
      slug: "meta",
      name: "Meta Ads",
      version: "0.1.0",
      description: "Read-only test-mode ad account spend and impressions",
      capabilities: ["read", "oauth"],
    };
  }

  authSpec(): AuthSpec {
    return {
      type: "oauth2",
      scopes: [...META_SCOPES],
      authorizationUrl: META_AUTHORIZATION_URL,
      tokenUrl: META_TOKEN_URL,
    };
  }

  async listResources(ctx: ConnectorContext): Promise<Resource[]> {
    return (await this.accounts(ctx)).map((account) => ({ name: account.id, kind: "account", description: account.name }));
  }

  async describeSchema(_ctx: ConnectorContext, resource: string): Promise<Record<string, unknown>> {
    if (!ACCOUNT_ID.test(resource)) throw new ConnectorError(`Unknown resource ${resource}`, "not_found");
    return {
      fields: [
        { name: "id", type: "string" },
        { name: "name", type: "string" },
        { name: "spend", type: "number" },
        { name: "impressions", type: "number" },
      ],
    };
  }

  async queryMetrics(ctx: ConnectorContext, query: MetricQuery): Promise<MetricResult[]> {
    const spec = METRIC_FIELDS[normalizeMetric(query.metric)];
    const selected = new Set(query.dimensions.filter((id) => ACCOUNT_ID.test(id)));
    if (selected.size === 0) throw new ConnectorError("Select a Meta ad account before syncing", "invalid_input");
    const accounts = await this.accounts(ctx);
    const targets = accounts.filter((account) => selected.has(account.id));
    if (targets.length !== selected.size) throw new ConnectorError("Meta ad account is not readable", "permission_changed");
    const since = utcDate(query.from);
    const until = utcDate(new Date(Date.parse(query.to) - 1).toISOString());
    if (until < since) throw new ConnectorError("Metric window is empty", "invalid_input");
    let total = 0;
    for (const account of targets) {
      const rows = await this.insights(ctx, account.id, spec.field, since, until);
      for (const row of rows) total += readNumber(row[spec.field]);
    }
    return [
      {
        metric: query.metric,
        value: total,
        unit: spec.unit,
        lineage: { source: "meta", fetchedAt: new Date().toISOString(), definitionVersion: "1" },
      },
    ];
  }

  async health(ctx: ConnectorContext): Promise<HealthResult> {
    const checkedAt = new Date().toISOString();
    try {
      await this.accounts(ctx);
      return { status: "ok", checkedAt, message: "Meta ad accounts are readable" };
    } catch (err) {
      return { status: "error", checkedAt, message: err instanceof ConnectorError ? err.message : "Meta health check failed" };
    }
  }

  async listTools(ctx: ConnectorContext): Promise<ToolSpec[]> {
    void ctx;
    return [{ name: "list_ad_accounts", description: "List Meta ad accounts this connection can read", risk: "low" }];
  }

  async listActions(ctx: ConnectorContext): Promise<ActionSpec[]> {
    void ctx;
    return [];
  }

  private fetch(): typeof fetch {
    return this.options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async accounts(ctx: ConnectorContext): Promise<AdAccount[]> {
    const rows = await this.pages(ctx, `${GRAPH}/me/adaccounts?fields=id,name,account_status`);
    const accounts: AdAccount[] = [];
    for (const row of rows) {
      if (typeof row.id !== "string" || !ACCOUNT_ID.test(row.id)) continue;
      accounts.push({ id: row.id, name: typeof row.name === "string" ? row.name : row.id });
    }
    return accounts;
  }

  private async insights(ctx: ConnectorContext, accountId: string, field: string, since: string, until: string): Promise<Record<string, unknown>[]> {
    const url = new URL(`${GRAPH}/${accountId}/insights`);
    url.searchParams.set("fields", field);
    url.searchParams.set("time_range", JSON.stringify({ since, until }));
    return this.pages(ctx, url.toString());
  }

  private async pages(ctx: ConnectorContext, start: string): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    let url = start;
    for (let page = 0; page < 10; page += 1) {
      const payload = await this.send(ctx, url);
      if (Array.isArray(payload.data)) {
        for (const row of payload.data) {
          if (typeof row === "object" && row !== null) rows.push(row as Record<string, unknown>);
        }
      }
      const next = nextPage(payload);
      if (!next || seen.has(next)) break;
      seen.add(next);
      url = next;
    }
    return rows;
  }

  private async send(ctx: ConnectorContext, url: string): Promise<Record<string, unknown>> {
    const headers = requestHeaders(ctx);
    let response: Response;
    try {
      response = await this.fetch()(url, { headers });
    } catch {
      throw new ConnectorError("Meta request failed", "provider_error", true);
    }
    if (!response.ok) {
      await response.text();
      throw mapStatus(response.status);
    }
    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null) throw new ConnectorError("Meta returned an unexpected payload", "provider_error");
    return payload as Record<string, unknown>;
  }
}

export const metaConnector = new MetaConnector();

function normalizeMetric(metric: string): MetricName {
  if (metric === "spend" || metric === "meta.spend") return "meta.spend";
  if (metric === "impressions" || metric === "meta.impressions") return "meta.impressions";
  throw new ConnectorError(`Unknown metric ${metric}`, "not_found");
}

function requestHeaders(ctx: ConnectorContext): Record<string, string> {
  const token = ctx.credentials.access_token ?? "";
  if (!token || /[\r\n]/.test(token)) throw new ConnectorError("Meta access token is missing", "auth_failed");
  return { authorization: `Bearer ${token}`, accept: "application/json" };
}

function nextPage(payload: Record<string, unknown>): string | null {
  const paging = payload.paging;
  if (typeof paging !== "object" || paging === null || !("next" in paging)) return null;
  const next = paging.next;
  if (typeof next !== "string") return null;
  const url = new URL(next);
  if (url.origin !== "https://graph.facebook.com") return null;
  url.searchParams.delete("access_token");
  return url.toString();
}

function mapStatus(status: number): ConnectorError {
  if (status === 401) return new ConnectorError("Meta access token was rejected", "auth_expired");
  if (status === 403) return new ConnectorError("Meta permission was denied", "permission_changed");
  if (status === 429) return new ConnectorError("Meta rate limit reached", "rate_limited", true);
  if (status === 404) return new ConnectorError("Meta ad account was not found", "not_found");
  if (status >= 500) return new ConnectorError("Meta request failed", "provider_error", true);
  return new ConnectorError("Meta request was rejected", "invalid_input");
}

function readNumber(value: unknown): number {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new ConnectorError("Meta returned an unexpected payload", "provider_error");
  return parsed;
}

function utcDate(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) throw new ConnectorError("Metric window is invalid", "invalid_input");
  return new Date(parsed).toISOString().slice(0, 10);
}
