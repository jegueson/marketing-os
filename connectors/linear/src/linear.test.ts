import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectorError, runConnectorContract } from "@marketing-os/connector-sdk";
import { LINEAR_GRAPHQL_URL, LinearConnector } from "./linear";

const ctx = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  connectionId: "33333333-3333-4333-8333-333333333333",
  credentials: { access_token: "sandbox-token" },
};

const issue = {
  title: "Weekly review",
  teamId: "9cfb482a-81e3-4154-b5b9-2c805e70a02d",
  description: "Spend rose without a lead change.",
  idempotencyKey: "issue-weekly-review",
};

function graphqlFixture(): typeof fetch {
  return vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? init.body : "";
    if (url !== LINEAR_GRAPHQL_URL) {
      throw new Error(`unexpected host ${url}`);
    }
    if (body.includes("viewer")) {
      return Response.json({ data: { viewer: { id: "user-1" } } });
    }
    if (body.includes("teams")) {
      return Response.json({ data: { teams: { nodes: [{ id: "team-1", name: "Marketing" }] } } });
    }
    if (body.includes("issueCreate")) {
      return Response.json({
        data: { issueCreate: { success: true, issue: { id: "lin-1", title: issue.title } } },
      });
    }
    if (body.includes("issues")) {
      return Response.json({ data: { issues: { nodes: [{ id: "lin-1" }] } } });
    }
    return Response.json({ data: {} });
  }) as unknown as typeof fetch;
}

describe("Linear connector", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", () => {
      throw new Error("test dialed the network");
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes the contract kit on the fake client", async () => {
    const fetchImpl = graphqlFixture();
    await runConnectorContract(new LinearConnector({ fetch: fetchImpl }), {
      metric: "linear.issues",
      credentials: ctx.credentials,
    });
    const actions = await new LinearConnector({ fetch: fetchImpl }).listActions(ctx);
    expect(actions).toEqual([
      {
        name: "create_issue",
        risk: "medium",
        requiresApproval: true,
        idempotencyRequired: true,
        supportsRollback: false,
      },
    ]);
  });

  it("refuses a missing idempotency key before the fake client is called", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ data: {} }));
    const connector = new LinearConnector({ fetch: fetchImpl as unknown as typeof fetch });
    await expect(
      connector.createIssue(ctx, { ...issue, idempotencyKey: "   " }),
    ).rejects.toBeInstanceOf(ConnectorError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a caller URL before the fake client is called", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ data: {} }));
    const connector = new LinearConnector({ fetch: fetchImpl as unknown as typeof fetch });
    await expect(
      connector.createIssue(ctx, { ...issue, url: "https://evil.example/graphql" }),
    ).rejects.toThrow(/host is fixed/);
    await expect(
      connector.createIssue(
        { ...ctx, credentials: { ...ctx.credentials, base_url: "https://evil.example" } },
        issue,
      ),
    ).rejects.toThrow(/host is fixed/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("creates an issue only at the fixed Linear host", async () => {
    const fetchImpl = graphqlFixture();
    const created = await new LinearConnector({ fetch: fetchImpl }).createIssue(ctx, issue);
    expect(created).toEqual({ id: "lin-1", title: issue.title });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.linear.app/graphql");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer sandbox-token");
    expect(new Headers(init.headers).get("idempotency-key")).toBe(issue.idempotencyKey);
    expect(String(init.body)).toContain(issue.title);
    expect(String(init.body)).not.toContain("evil.example");
  });
});
