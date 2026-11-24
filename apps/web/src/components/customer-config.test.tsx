/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ApiClient, Envelope } from "../lib/api";
import { CustomerConfig } from "./customer-config";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const workspaces = [{ id: workspaceId, name: "Main" }];
const workflowId = "00000000-0000-4000-8000-000000000099";

type Call = { path: string; method: string };

function ok<T>(data: T): Envelope<T> {
  return { success: true, data, error: null, meta: null };
}

function fail(code: string, message: string): Envelope<null> {
  return { success: false, data: null, error: { code, message }, meta: null };
}

function client(
  handler: (path: string, method: string) => Envelope<unknown> | Promise<Envelope<unknown>>,
): { api: ApiClient; calls: Call[] } {
  const calls: Call[] = [];
  const api = (async (path: string, options?: { method?: string }) => {
    const method = options?.method ?? "GET";
    calls.push({ path, method });
    return handler(path, method);
  }) as ApiClient;
  return { api, calls };
}

describe("customer config", () => {
  afterEach(() => cleanup());

  it("hides the section when specialist_config is off", async () => {
    let finish: (value: Envelope<Record<string, boolean>>) => void = () => undefined;
    const features = new Promise<Envelope<Record<string, boolean>>>((resolve) => {
      finish = resolve;
    });
    const { api, calls } = client((path) => {
      if (path === "/api/v1/me/features") return features;
      return fail("unexpected", path);
    });
    render(<CustomerConfig api={api} workspaces={workspaces} />);
    expect(screen.queryByRole("heading", { name: "Specialist configuration" })).toBeNull();
    await act(async () => {
      finish(ok({ specialist_config: false }));
      await features;
    });
    expect(screen.queryByRole("heading", { name: "Specialist configuration" })).toBeNull();
    expect(calls.some((call) => call.path.includes("/skills"))).toBe(false);
  });

  it("lists workflows and renders the test-run report from the API payload", async () => {
    const reportBody = "mock.spend: 2550 EUR\nSpend moved with the observed value.";
    const { api, calls } = client((path, method) => {
      if (path === "/api/v1/me/features") return ok({ specialist_config: true });
      if (path.endsWith("/skills")) {
        return ok([
          {
            id: "00000000-0000-4000-8000-000000000011",
            status: "published",
            activeVersion: 1,
            draft: { name: "weekly-performance-review", domain: "performance", version: "1.0.0" },
          },
        ]);
      }
      if (path.endsWith("/agents")) {
        return ok([
          {
            id: "00000000-0000-4000-8000-000000000012",
            status: "published",
            activeVersion: 1,
            draft: { name: "performance-analyst", autonomy: "observe", version: "1.0.0" },
          },
        ]);
      }
      if (path.endsWith("/workflows") && method === "GET") {
        return ok([
          {
            id: workflowId,
            status: "published",
            activeVersion: 1,
            draft: {
              name: "weekly-performance-review",
              version: "1.0.0",
              trigger: { type: "manual" },
            },
          },
        ]);
      }
      if (path.endsWith(`/workflows/${workflowId}/test-runs`) && method === "POST") {
        return ok({
          id: "00000000-0000-4000-8000-000000000077",
          workflowId,
          status: "succeeded",
          errorCode: null,
          report: { title: "Weekly review", body: reportBody },
        });
      }
      return fail("unexpected", path);
    });

    render(<CustomerConfig api={api} workspaces={workspaces} />);
    expect(await screen.findByRole("heading", { name: "Specialist configuration" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "weekly-performance-review" })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Workflows" }));
    const workflowCard = await screen.findByRole("heading", { name: "weekly-performance-review" });
    expect(workflowCard).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Run test" }));

    const report = await screen.findByLabelText("Latest test-run report");
    expect(within(report).getByRole("heading", { name: "Weekly review" })).toBeTruthy();
    expect(report.textContent).toContain(reportBody);
    expect(calls.some((call) => call.method === "POST" && call.path.includes("/test-runs"))).toBe(true);
  });
});
