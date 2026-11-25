/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ApiClient, Envelope } from "../lib/api";
import { ApprovalsScreen } from "./approvals-screen";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const approvalId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const evidence = "mock.spend is 2550. Previous period is 2100. Lead count is unchanged.";

const fixture = {
  id: approvalId,
  action: "linear.create_issue",
  riskLevel: "medium",
  evidence,
  expectedImpact: "The specialist gets one tracked task.",
  status: "pending",
  comment: null,
  requesterId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  reviewerId: null,
  expiresAt: "2026-11-28T09:00:00.000Z",
  decidedAt: null,
};

type Call = { path: string; method: string; body?: unknown };

function ok<T>(data: T): Envelope<T> {
  return { success: true, data, error: null, meta: null };
}

function client(flag: boolean): { api: ApiClient; calls: Call[] } {
  const calls: Call[] = [];
  const api = (async (path: string, options?: { method?: string; body?: unknown }) => {
    const method = options?.method ?? "GET";
    calls.push({ path, method, ...(options?.body !== undefined ? { body: options.body } : {}) });
    if (path === "/api/v1/me/features") return ok({ managed_work: flag });
    if (path.endsWith("/approvals") && method === "GET") return ok([fixture]);
    if (path.endsWith("/decision") && method === "POST") {
      const body = options?.body as { decision: string; comment: string };
      return ok({ ...fixture, status: body.decision, comment: body.comment });
    }
    return { success: false, data: null, error: { code: "unexpected", message: path }, meta: null };
  }) as ApiClient;
  return { api, calls };
}

afterEach(() => cleanup());

describe("portal approvals", () => {
  it("hides the section while managed_work is off", async () => {
    let finish: (value: Envelope<Record<string, boolean>>) => void = () => undefined;
    const features = new Promise<Envelope<Record<string, boolean>>>((resolve) => {
      finish = resolve;
    });
    const calls: Call[] = [];
    const api = (async (path: string) => {
      calls.push({ path, method: "GET" });
      if (path === "/api/v1/me/features") return features;
      return ok([]);
    }) as ApiClient;
    render(<ApprovalsScreen api={api} workspaceId={workspaceId} role="customer_admin" />);
    expect(screen.queryByRole("heading", { name: "Approvals" })).toBeNull();
    await act(async () => {
      finish(ok({ managed_work: false }));
      await features;
    });
    expect(screen.queryByRole("heading", { name: "Approvals" })).toBeNull();
    expect(calls.some((call) => call.path.includes("/approvals"))).toBe(false);
  });

  it("shows the fixture evidence", async () => {
    const { api } = client(true);
    render(<ApprovalsScreen api={api} workspaceId={workspaceId} role="customer_admin" />);
    expect((await screen.findAllByText(evidence)).length).toBeGreaterThan(0);
    expect(screen.getByText("linear.create_issue")).toBeTruthy();
    expect(screen.getByText("The specialist gets one tracked task.")).toBeTruthy();
    expect(screen.getByText("medium")).toBeTruthy();
    expect(screen.getByText(fixture.requesterId)).toBeTruthy();
  });

  it("sends the comment when the reviewer rejects", async () => {
    const { api, calls } = client(true);
    render(<ApprovalsScreen api={api} workspaceId={workspaceId} role="customer_admin" />);
    expect((await screen.findAllByText(evidence)).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Comment"), { target: { value: "Not this week." } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    const posted = calls.find((call) => call.method === "POST");
    expect(posted).toEqual({
      path: `/api/v1/workspaces/${workspaceId}/approvals/${approvalId}/decision`,
      method: "POST",
      body: { decision: "rejected", comment: "Not this week." },
    });
  });

  it("approves one fixture item and keeps both buttons in the tab order", async () => {
    const { api, calls } = client(true);
    render(<ApprovalsScreen api={api} workspaceId={workspaceId} role="customer_admin" />);
    const approve = await screen.findByRole("button", { name: "Approve" });
    const reject = screen.getByRole("button", { name: "Reject" });
    approve.focus();
    expect(document.activeElement).toBe(approve);
    reject.focus();
    expect(document.activeElement).toBe(reject);
    fireEvent.change(screen.getByLabelText("Comment"), { target: { value: "Approved for the weekly review." } });
    fireEvent.click(approve);
    const posted = calls.find((call) => call.method === "POST");
    expect(posted?.body).toEqual({ decision: "approved", comment: "Approved for the weekly review." });
  });
});
