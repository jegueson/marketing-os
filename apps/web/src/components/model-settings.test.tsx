/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient, Envelope } from "../lib/api";
import { ModelSettings } from "./model-settings";

const workspaceId = "00000000-0000-4000-8000-000000000001";

function ok<T>(data: T): Envelope<T> {
  return { success: true, data, error: null, meta: null };
}

function fail(code: string, message: string): Envelope<null> {
  return { success: false, data: null, error: { code, message }, meta: null };
}

const emptySettings = {
  configured: false,
  provider: null,
  baseUrl: null,
  defaultModel: null,
  fingerprint: null,
};

const usage = {
  periodStart: "2026-11-01T00:00:00.000Z",
  periodEnd: "2026-12-01T00:00:00.000Z",
  totalCostMicroUsd: 900,
  inputTokens: 10,
  outputTokens: 20,
  calls: 4,
  budget: null,
};

function client(handler: (path: string, method: string, body: unknown) => Envelope<unknown>): ApiClient {
  return (async (path, options) => handler(path, options?.method ?? "GET", options?.body)) as ApiClient;
}

describe("model settings", () => {
  afterEach(() => cleanup());
  it("saves a model, shows usage, and never puts the key back in the field", async () => {
    const api = client((path, method) => {
      if (path.endsWith("/models/usage")) return ok(usage);
      if (method === "PUT" && path.endsWith("/models/settings")) {
        return ok({
          configured: true,
          provider: "openrouter",
          baseUrl: null,
          defaultModel: "gpt-test",
          fingerprint: "fp-1",
          apiKey: "sk-or-v1-should-not-appear",
        });
      }
      return ok(emptySettings);
    });
    render(<ModelSettings api={api} workspaceId={workspaceId} role="customer_admin" />);
    const key = await screen.findByLabelText("API key");
    expect((key as HTMLInputElement).value).toBe("");
    fireEvent.change(key, { target: { value: "sk-or-v1-typed-key-123" } });
    fireEvent.change(screen.getByLabelText("Default model"), { target: { value: "gpt-test" } });
    fireEvent.click(screen.getByRole("button", { name: "Save model settings" }));
    expect((await screen.findByRole("status")).getAttribute("data-state")).toBe("success");
    expect(screen.getByText("fp-1")).toBeTruthy();
    expect(screen.getByText("900")).toBeTruthy();
    expect((screen.getByLabelText("API key") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("sk-or-v1-should-not-appear")).toBeNull();
    expect(screen.queryByText("sk-or-v1-typed-key-123")).toBeNull();
  });

  it("shows invalid_key when the provider rejects the stored key", async () => {
    const api = client((path, method) => {
      if (path.endsWith("/models/usage")) return ok(usage);
      if (method === "POST" && path.endsWith("/models/test")) {
        return fail("invalid_key", "Model provider rejected the API key");
      }
      return ok({ ...emptySettings, configured: true, provider: "openrouter", fingerprint: "fp-1" });
    });
    render(<ModelSettings api={api} workspaceId={workspaceId} role="customer_admin" />);
    fireEvent.click(await screen.findByRole("button", { name: "Test connection" }));
    expect((await screen.findByRole("status")).getAttribute("data-state")).toBe("invalid_key");
    expect((screen.getByLabelText("API key") as HTMLInputElement).value).toBe("");
  });

  it("shows endpoint_blocked when the base URL is refused", async () => {
    const api = client((path, method) => {
      if (path.endsWith("/models/usage")) return ok(usage);
      if (method === "PUT" && path.endsWith("/models/settings")) {
        return fail("validation_error", "Model endpoint host is blocked");
      }
      return ok(emptySettings);
    });
    render(<ModelSettings api={api} workspaceId={workspaceId} role="customer_admin" />);
    fireEvent.change(await screen.findByLabelText("Provider"), { target: { value: "openai_compatible" } });
    fireEvent.change(screen.getByLabelText("Base URL"), { target: { value: "http://127.0.0.1:11434" } });
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "sk-or-v1-typed-key-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Save model settings" }));
    expect((await screen.findByRole("status")).getAttribute("data-state")).toBe("endpoint_blocked");
    expect((screen.getByLabelText("API key") as HTMLInputElement).value).toBe("sk-or-v1-typed-key-123");
    expect(screen.queryByDisplayValue("sk-or-v1-should-not-appear")).toBeNull();
  });

  it("hides the form from a member who cannot manage models", async () => {
    const api = vi.fn();
    render(<ModelSettings api={api as unknown as ApiClient} workspaceId={workspaceId} role="customer_user" />);
    expect(await screen.findByText(/limited to workspace admins/i)).toBeTruthy();
    expect(screen.queryByLabelText("API key")).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });
});
