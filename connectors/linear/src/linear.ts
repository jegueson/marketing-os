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

/** Linear's GraphQL host. Callers cannot replace it. */
export const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

const CALLER_URL_FIELDS = ["url", "endpoint", "host", "base_url", "baseUrl"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LinearIssueDraft = {
  title: string;
  teamId: string;
  description?: string;
  idempotencyKey: string;
  url?: string;
  endpoint?: string;
  host?: string;
  base_url?: string;
  baseUrl?: string;
};

export type LinearIssueCreated = {
  id: string;
  title: string;
};

type FetchLike = typeof fetch;

export type LinearConnectorOptions = {
  fetch?: FetchLike;
};

type IssueCreateData = {
  issueCreate?: { success?: boolean; issue?: { id?: string; title?: string } };
};

/**
 * Linear issue create. The OAuth app is still submitted. Tests pass a fake fetch.
 * The only write is create_issue, and it always posts to LINEAR_GRAPHQL_URL.
 */
export class LinearConnector implements Connector {
  constructor(private readonly options: LinearConnectorOptions = {}) {}

  metadata(): ConnectorMetadata {
    return {
      slug: "linear",
      name: "Linear",
      version: "0.1.0",
      description: "Create a Linear issue after approval",
      capabilities: ["read", "oauth", "actions"],
    };
  }

  authSpec(): AuthSpec {
    return {
      type: "oauth2",
      scopes: ["issues:create"],
      authorizationUrl: "https://linear.app/oauth/authorize",
      tokenUrl: "https://api.linear.app/oauth/token",
    };
  }

  async listResources(ctx: ConnectorContext): Promise<Resource[]> {
    const data = await this.graphql<{ teams?: { nodes?: { id: string; name: string }[] } }>(
      ctx,
      "query Teams { teams { nodes { id name } } }",
    );
    const nodes = data.teams?.nodes ?? [];
    return nodes.map((team) => ({ name: team.id, kind: "team", description: team.name }));
  }

  async describeSchema(_ctx: ConnectorContext, resource: string): Promise<Record<string, unknown>> {
    if (!resource.trim()) throw new ConnectorError("Unknown resource", "not_found");
    return {
      fields: [
        { name: "id", type: "string" },
        { name: "title", type: "string" },
        { name: "teamId", type: "string" },
      ],
    };
  }

  async queryMetrics(ctx: ConnectorContext, query: MetricQuery): Promise<MetricResult[]> {
    if (query.metric !== "linear.issues") {
      throw new ConnectorError(`Unknown metric ${query.metric}`, "not_found");
    }
    const data = await this.graphql<{ issues?: { nodes?: { id: string }[] } }>(
      ctx,
      "query Issues { issues { nodes { id } } }",
    );
    return [
      {
        metric: query.metric,
        value: data.issues?.nodes?.length ?? 0,
        unit: "count",
        lineage: {
          source: "linear",
          fetchedAt: new Date().toISOString(),
          definitionVersion: "1",
        },
      },
    ];
  }

  async health(ctx: ConnectorContext): Promise<HealthResult> {
    const checkedAt = new Date().toISOString();
    try {
      const data = await this.graphql<{ viewer?: { id?: string } }>(ctx, "query Viewer { viewer { id } }");
      if (!data.viewer?.id) {
        return { status: "error", checkedAt, message: "Linear viewer missing" };
      }
      return { status: "ok", checkedAt, message: "Linear reachable" };
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
    return [{ name: "list_teams", description: "List Linear teams", risk: "low" }];
  }

  async listActions(_ctx: ConnectorContext): Promise<ActionSpec[]> {
    void _ctx;
    return [
      {
        name: "create_issue",
        risk: "medium",
        requiresApproval: true,
        idempotencyRequired: true,
        supportsRollback: false,
      },
    ];
  }

  async createIssue(ctx: ConnectorContext, input: LinearIssueDraft): Promise<LinearIssueCreated> {
    assertNoCallerUrl(input, ctx.credentials);
    const idempotencyKey = requireKey(input.idempotencyKey);
    const title = requireField(input.title, "Title");
    const teamId = requireField(input.teamId, "Team id");
    const description = input.description?.trim() ?? "";
    const variables: Record<string, string> = { title, teamId };
    if (description.length > 0) variables.description = description;
    const request = issueCreateRequest(idempotencyKey, variables);
    const data = await this.graphql<IssueCreateData>(ctx, request.query, request.variables, {
      "idempotency-key": idempotencyKey,
    });
    const created = data.issueCreate;
    const id = created?.issue?.id;
    if (!created?.success || !id) {
      throw new ConnectorError("Linear issueCreate failed", "provider_error", true);
    }
    return { id, title: created.issue?.title ?? title };
  }

  private async graphql<T>(
    ctx: ConnectorContext,
    query: string,
    variables?: Record<string, string>,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    assertNoCredentialHost(ctx.credentials);
    const token = ctx.credentials["access_token"]?.trim() ?? "";
    if (!token) throw new ConnectorError("Linear access token is required", "auth_failed");
    const headers = new Headers(extraHeaders);
    headers.set("content-type", "application/json");
    headers.set("authorization", `Bearer ${token}`);
    const fetchImpl = this.options.fetch ?? fetch;
    const response = await fetchImpl(LINEAR_GRAPHQL_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(variables ? { query, variables } : { query }),
      redirect: "error",
    });
    if (!response.ok) {
      throw new ConnectorError(`Linear GraphQL failed with ${response.status}`, "provider_error", true);
    }
    const json = (await response.json()) as { data?: T; errors?: unknown[] };
    if (json.errors && json.errors.length > 0) {
      throw new ConnectorError("Linear GraphQL returned errors", "provider_error", true);
    }
    if (!json.data) throw new ConnectorError("Linear GraphQL returned no data", "provider_error", true);
    return json.data;
  }
}

function assertNoCallerUrl(input: LinearIssueDraft, credentials: Record<string, string>): void {
  for (const field of CALLER_URL_FIELDS) {
    const value = input[field];
    if (typeof value === "string" && value.trim().length > 0) {
      throw new ConnectorError("Linear host is fixed", "invalid_input");
    }
  }
  assertNoCredentialHost(credentials);
}

function assertNoCredentialHost(credentials: Record<string, string>): void {
  if (credentials["base_url"]?.trim() || credentials["baseUrl"]?.trim()) {
    throw new ConnectorError("Linear host is fixed", "invalid_input");
  }
}

function requireKey(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length < 1 || trimmed.length > 200) {
    throw new ConnectorError("Idempotency key is required", "invalid_input");
  }
  return trimmed;
}

function requireField(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 2000) {
    throw new ConnectorError(`${label} is required`, "invalid_input");
  }
  return trimmed;
}

/** Linear accepts a client issue id only as a UUID. Other keys stay in the header. */
function issueCreateRequest(
  idempotencyKey: string,
  variables: Record<string, string>,
): { query: string; variables: Record<string, string> } {
  if (UUID_RE.test(idempotencyKey)) {
    return {
      query: `mutation IssueCreate($title: String!, $description: String, $teamId: String!, $id: String) {
        issueCreate(input: { title: $title, description: $description, teamId: $teamId, id: $id }) {
          success
          issue { id title }
        }
      }`,
      variables: { ...variables, id: idempotencyKey },
    };
  }
  return {
    query: `mutation IssueCreate($title: String!, $description: String, $teamId: String!) {
      issueCreate(input: { title: $title, description: $description, teamId: $teamId }) {
        success
        issue { id title }
      }
    }`,
    variables,
  };
}

export const linearConnector = new LinearConnector();
