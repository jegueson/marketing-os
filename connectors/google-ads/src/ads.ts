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
import { GOOGLE_ADS_AUTHORIZATION_URL, GOOGLE_ADS_SCOPES, GOOGLE_ADS_TOKEN_URL } from "./oauth";

/** REST version from the Google Ads API docs. Bump only with a recorded-fixture update. */
const API_VERSION = "v26";
const API_ORIGIN = `https://googleads.googleapis.com/${API_VERSION}`;
const CUSTOMER_ID = /^customers\/(\d{1,10})$/;

/** Platform catalog keys this connector writes on each sync window. */
export const GOOGLE_ADS_METRICS = ["google_ads.spend", "google_ads.conversions"] as const;

type MetricSpec = {
  field: string;
  unit: string;
  read: (metrics: Record<string, unknown>) => number;
};

const METRICS: Record<string, MetricSpec> = {
  "google_ads.spend": { field: "metrics.cost_micros", unit: "currency", read: (metrics) => micros(metrics.costMicros) },
  spend: { field: "metrics.cost_micros", unit: "currency", read: (metrics) => micros(metrics.costMicros) },
  "google_ads.conversions": { field: "metrics.conversions", unit: "count", read: (metrics) => finite(metrics.conversions) },
  conversions: { field: "metrics.conversions", unit: "count", read: (metrics) => finite(metrics.conversions) },
};

type Account = {
  id: string;
  name: string;
  manager: boolean;
  parentId?: string;
};

export class GoogleAdsConnector implements Connector {
  constructor(private readonly options: { fetch?: typeof fetch } = {}) {}

  metadata(): ConnectorMetadata {
    return {
      slug: "google-ads",
      name: "Google Ads",
      version: "0.1.0",
      description: "Read-only test-account spend and conversions",
      capabilities: ["read", "oauth"],
    };
  }

  authSpec(): AuthSpec {
    return {
      type: "oauth2",
      scopes: [...GOOGLE_ADS_SCOPES],
      authorizationUrl: GOOGLE_ADS_AUTHORIZATION_URL,
      tokenUrl: GOOGLE_ADS_TOKEN_URL,
    };
  }

  async listResources(ctx: ConnectorContext): Promise<Resource[]> {
    return (await this.discover(ctx)).map((account) => ({
      name: account.id,
      kind: "account",
      description: account.name,
      ...(account.parentId ? { parentId: account.parentId } : {}),
    }));
  }

  async describeSchema(_ctx: ConnectorContext, resource: string): Promise<Record<string, unknown>> {
    if (!CUSTOMER_ID.test(resource)) throw new ConnectorError(`Unknown resource ${resource}`, "not_found");
    return {
      fields: [
        { name: "id", type: "string" },
        { name: "name", type: "string" },
        { name: "cost_micros", type: "number" },
        { name: "conversions", type: "number" },
      ],
    };
  }

  async queryMetrics(ctx: ConnectorContext, query: MetricQuery): Promise<MetricResult[]> {
    const spec = METRICS[query.metric];
    if (!spec) throw new ConnectorError(`Unknown metric ${query.metric}`, "not_found");
    const selected = query.dimensions.filter((id) => CUSTOMER_ID.test(id));
    if (selected.length === 0) throw new ConnectorError("Select a Google Ads account before syncing", "invalid_input");
    const accounts = await this.discover(ctx);
    const targets = new Map<string, Account>();
    const chosen = new Set(selected);
    for (const account of accounts) {
      const explicit = chosen.has(account.id);
      const underChosenManager = account.parentId ? chosen.has(account.parentId) : false;
      if ((explicit || underChosenManager) && !account.manager) targets.set(account.id, account);
    }
    if (targets.size === 0) throw new ConnectorError("Select a Google Ads client account before syncing", "invalid_input");
    const startDate = utcDate(query.from);
    const endDate = utcDate(new Date(Date.parse(query.to) - 1).toISOString());
    if (endDate < startDate) throw new ConnectorError("Metric window is empty", "invalid_input");
    let total = 0;
    for (const account of targets.values()) {
      const rows = await this.search(
        ctx,
        account.id,
        `SELECT ${spec.field} FROM customer WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`,
        account.parentId,
      );
      total += sumMetric(rows, spec.read);
    }
    return [
      {
        metric: query.metric,
        value: total,
        unit: spec.unit,
        lineage: { source: "google_ads", fetchedAt: new Date().toISOString(), definitionVersion: "1" },
      },
    ];
  }

  async health(ctx: ConnectorContext): Promise<HealthResult> {
    const checkedAt = new Date().toISOString();
    try {
      await this.discover(ctx);
      return { status: "ok", checkedAt, message: "Google Ads accounts are readable" };
    } catch (err) {
      return {
        status: "error",
        checkedAt,
        message: err instanceof ConnectorError ? err.message : "Google Ads health check failed",
      };
    }
  }

  async listTools(ctx: ConnectorContext): Promise<ToolSpec[]> {
    void ctx;
    return [{ name: "list_accounts", description: "List Google Ads accounts and MCC clients", risk: "low" }];
  }

  async listActions(ctx: ConnectorContext): Promise<ActionSpec[]> {
    void ctx;
    return [];
  }

  private fetch(): typeof fetch {
    return this.options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async discover(ctx: ConnectorContext): Promise<Account[]> {
    const accounts: Account[] = [];
    for (const id of await this.accessibleCustomers(ctx)) {
      const clients = await this.customerClients(ctx, id);
      if (clients.length === 0) {
        accounts.push({ id, name: id, manager: false });
        continue;
      }
      for (const client of clients) {
        accounts.push({
          id: client.id,
          name: client.name,
          manager: client.manager,
          ...(client.id !== id && !client.manager ? { parentId: id } : {}),
        });
      }
    }
    return accounts;
  }

  private async accessibleCustomers(ctx: ConnectorContext): Promise<string[]> {
    const payload = await this.send(ctx, `${API_ORIGIN}/customers:listAccessibleCustomers`);
    const names = Array.isArray(payload.customers)
      ? payload.customers
      : Array.isArray(payload.resourceNames)
        ? payload.resourceNames
        : [];
    return names.filter((name): name is string => typeof name === "string" && CUSTOMER_ID.test(name));
  }

  private async customerClients(ctx: ConnectorContext, customerId: string): Promise<{ id: string; name: string; manager: boolean }[]> {
    const rows = await this.search(
      ctx,
      customerId,
      "SELECT customer_client.client_customer, customer_client.descriptive_name, customer_client.manager, customer_client.level FROM customer_client WHERE customer_client.level <= 1",
    );
    const clients: { id: string; name: string; manager: boolean }[] = [];
    for (const row of rows) {
      const client = customerClient(row.customerClient);
      if (!client) continue;
      clients.push(client);
    }
    return clients;
  }

  private async search(ctx: ConnectorContext, customerId: string, query: string, loginCustomerId?: string): Promise<Record<string, unknown>[]> {
    const digits = customerDigits(customerId);
    const rows: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    let pageToken = "";
    for (let page = 0; page < 10; page += 1) {
      const payload = await this.send(
        ctx,
        `${API_ORIGIN}/customers/${digits}/googleAds:search`,
        JSON.stringify(pageToken ? { query, pageToken } : { query }),
        loginCustomerId,
      );
      if (Array.isArray(payload.results)) {
        for (const row of payload.results) {
          if (typeof row === "object" && row !== null) rows.push(row as Record<string, unknown>);
        }
      }
      const next = typeof payload.nextPageToken === "string" ? payload.nextPageToken : "";
      if (!next || seen.has(next)) break;
      seen.add(next);
      pageToken = next;
    }
    return rows;
  }

  private async send(ctx: ConnectorContext, url: string, body?: string, loginCustomerId?: string): Promise<Record<string, unknown>> {
    const headers = requestHeaders(ctx, loginCustomerId, Boolean(body));
    let response: Response;
    try {
      response = await this.fetch()(url, {
        method: body ? "POST" : "GET",
        headers,
        ...(body ? { body } : {}),
      });
    } catch {
      throw new ConnectorError("Google Ads request failed", "provider_error", true);
    }
    if (!response.ok) {
      await response.text();
      throw mapStatus(response.status);
    }
    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null) {
      throw new ConnectorError("Google Ads returned an unexpected payload", "provider_error");
    }
    return payload as Record<string, unknown>;
  }
}

export const googleAdsConnector = new GoogleAdsConnector();

function requestHeaders(ctx: ConnectorContext, loginCustomerId: string | undefined, json: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${secret(ctx.credentials.access_token, "Google Ads access token is missing")}`,
    "developer-token": secret(ctx.credentials.developer_token, "Google Ads developer token is not configured"),
    accept: "application/json",
  };
  if (json) headers["content-type"] = "application/json";
  if (loginCustomerId) headers["login-customer-id"] = customerDigits(loginCustomerId);
  return headers;
}

function secret(value: string | undefined, message: string): string {
  if (!value || /[\r\n]/.test(value)) throw new ConnectorError(message, "invalid_input");
  return value;
}

function mapStatus(status: number): ConnectorError {
  if (status === 401) return new ConnectorError("Google Ads access token was rejected", "auth_expired");
  if (status === 403) return new ConnectorError("Google Ads permission was denied", "permission_changed");
  if (status === 429) return new ConnectorError("Google Ads rate limit reached", "rate_limited", true);
  if (status === 404) return new ConnectorError("Google Ads account was not found", "not_found");
  if (status >= 500) return new ConnectorError("Google Ads request failed", "provider_error", true);
  return new ConnectorError("Google Ads request was rejected", "invalid_input");
}

function customerClient(value: unknown): { id: string; name: string; manager: boolean } | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const id = record.clientCustomer;
  if (typeof id !== "string" || !CUSTOMER_ID.test(id)) return null;
  return {
    id,
    name: typeof record.descriptiveName === "string" ? record.descriptiveName : id,
    manager: record.manager === true,
  };
}

function customerDigits(id: string): string {
  const match = CUSTOMER_ID.exec(id);
  if (!match?.[1]) throw new ConnectorError("Google Ads customer id is invalid", "invalid_input");
  return match[1];
}

function sumMetric(rows: Record<string, unknown>[], read: (metrics: Record<string, unknown>) => number): number {
  let total = 0;
  for (const row of rows) {
    const metrics = row.metrics;
    if (typeof metrics !== "object" || metrics === null) continue;
    total += read(metrics as Record<string, unknown>);
  }
  return total;
}

function micros(value: unknown): number {
  return finite(value) / 1_000_000;
}

function finite(value: unknown): number {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new ConnectorError("Google Ads returned an unexpected payload", "provider_error");
  return parsed;
}

function utcDate(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) throw new ConnectorError("Metric window is invalid", "invalid_input");
  return new Date(parsed).toISOString().slice(0, 10);
}
