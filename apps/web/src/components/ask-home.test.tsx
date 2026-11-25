/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ApiClient, Envelope } from "../lib/api";
import { AskHome } from "./ask-home";

const workspaceId = "00000000-0000-4000-8000-000000000001";

function ok<T>(data: T): Envelope<T> {
  return { success: true, data, error: null, meta: null };
}

type Stored = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: { id: string; role: "user" | "assistant"; content: string; createdAt: string }[];
};

function card(key: string, label: string, value: number | null) {
  return {
    key,
    label,
    value,
    previous: null,
    target: null,
    delta: null,
    source: "mock",
    freshness: value == null ? "empty" : "live",
    definitionVersion: "1",
    widgets: ["executive"],
  };
}

function cockpit(cards: ReturnType<typeof card>[]) {
  return {
    header: {
      workspaceId,
      workspaceName: "Acme",
      period: { from: "2026-10-20", to: "2026-11-19", label: "Last 30 days" },
      freshness: "live",
    },
    widgets: { executive: cards, performance: [], funnel: [], leads: [] },
    attention_queue: [],
    recommendations: [],
    workload: [],
    data_health: [],
    empty_state: null,
  };
}

function harness(options: { flag: boolean; configured: boolean; cards?: ReturnType<typeof card>[] }) {
  const store: Stored[] = [];
  const calls: string[] = [];
  const api = (async (path: string, init?: { method?: string; body?: unknown }) => {
    calls.push(`${init?.method ?? "GET"} ${path}`);
    if (path.endsWith("/features")) return ok({ ask_marketing: options.flag });
    if (path.endsWith("/models/settings")) return ok({ configured: options.configured, provider: null, baseUrl: null, defaultModel: null, fingerprint: null });
    if (path.endsWith("/cockpit")) return ok(cockpit(options.cards ?? []));
    if (path.endsWith("/ask/conversations") && (init?.method ?? "GET") === "POST") {
      const title = (init?.body as { title: string }).title;
      const row: Stored = {
        id: "00000000-0000-4000-8000-000000000010",
        title,
        createdAt: "2026-11-19T12:00:00.000Z",
        updatedAt: "2026-11-19T12:00:00.000Z",
        messages: [],
      };
      store.push(row);
      return ok(row);
    }
    const one = path.match(/\/ask\/conversations\/([^/?]+)$/);
    if (one && init?.method === "DELETE") {
      const index = store.findIndex((row) => row.id === one[1]);
      if (index >= 0) store.splice(index, 1);
      return ok({ id: one[1], deleted: true });
    }
    if (one) {
      const row = store.find((item) => item.id === one[1]);
      return row ? ok(row) : { success: false, data: null, error: { code: "not_found", message: "Missing" }, meta: null };
    }
    if (path.includes("/ask/conversations")) return ok(store.map(({ messages: _messages, ...row }) => row));
    return { success: false, data: null, error: { code: "not_found", message: path }, meta: null };
  }) as ApiClient;
  return { api, store, calls };
}

describe("ask page", () => {
  afterEach(() => cleanup());

  it("does not load conversations when the flag is off", async () => {
    const { api, calls } = harness({ flag: false, configured: true });
    render(<AskHome api={api} workspaceId={workspaceId} role="customer_admin" />);
    expect(await screen.findByText(/Ask is not enabled/)).toBeTruthy();
    expect(calls.some((call) => call.includes("/ask/conversations"))).toBe(false);
  });

  it("shows an empty history when a model is configured and no metric has data", async () => {
    const { api } = harness({
      flag: true,
      configured: true,
      cards: [card("Sessions", "Sessions", null)],
    });
    render(<AskHome api={api} workspaceId={workspaceId} role="customer_admin" />);
    expect(await screen.findByText("No conversations yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sessions" })).toBeNull();
    expect(screen.getByRole("button", { name: "New conversation" })).toBeTruthy();
  });

  it("shows the no-model state instead of the composer", async () => {
    const { api } = harness({ flag: true, configured: false, cards: [card("Spend", "Spend", 2550)] });
    render(<AskHome api={api} workspaceId={workspaceId} role="customer_admin" />);
    expect(await screen.findByRole("heading", { name: "No model configured" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New conversation" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Spend" })).toBeNull();
  });

  it("builds a starter chip from a metric with data and keeps history after remount", async () => {
    const { api, store } = harness({
      flag: true,
      configured: true,
      cards: [card("Spend", "Spend", 2550), card("Sessions", "Sessions", null)],
    });
    const first = render(<AskHome api={api} workspaceId={workspaceId} role="customer_admin" />);
    fireEvent.click(await screen.findByRole("button", { name: "Spend" }));
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("How much is Spend?");
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    expect(await screen.findByRole("button", { name: "How much is Spend?" })).toBeTruthy();
    const created = store[0];
    if (!created) throw new Error("missing conversation");
    created.messages.push({
      id: "00000000-0000-4000-8000-000000000011",
      role: "user",
      content: "How much is Spend?",
      createdAt: "2026-11-19T12:01:00.000Z",
    });
    first.unmount();
    render(<AskHome api={api} workspaceId={workspaceId} role="customer_admin" />);
    fireEvent.click(await screen.findByRole("button", { name: "How much is Spend?" }));
    expect(await screen.findByText("user: How much is Spend?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete How much is Spend?" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "How much is Spend?" })).toBeNull());
    cleanup();
    render(<AskHome api={api} workspaceId={workspaceId} role="customer_admin" />);
    expect(await screen.findByText("No conversations yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "How much is Spend?" })).toBeNull();
  });
});
