/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ApiClient, Envelope } from "../lib/api";
import { CustomerProfiles } from "./customer-profiles";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const workspaces = [{ id: workspaceId, name: "Main" }];

const businessDraft = {
  companyDescription: "Acme sells workflow software.",
  businessModel: "Subscription",
  products: ["Acme Cloud"],
  markets: ["United Kingdom"],
  businessGoals: ["Grow pipeline"],
  marketingGoals: ["Hold CAC"],
  primaryKpis: ["mock.spend"],
  reportingCadence: "weekly",
};

const brandDraft = {
  positioning: "The operating system for a marketing team.",
  audience: "Marketing leads at B2B software companies.",
  tone: ["direct"],
  preferredTerms: ["pipeline"],
  bannedTerms: ["synergy"],
  approvedClaims: ["Connects the tools you already use"],
  prohibitedClaims: ["Guarantees revenue"],
  marketLanguage: ["en-GB"],
  exampleAssetIds: [],
};

type Call = { path: string; method: string; body: unknown };

function ok<T>(data: T): Envelope<T> {
  return { success: true, data, error: null, meta: null };
}

function fail(code: string, message: string): Envelope<null> {
  return { success: false, data: null, error: { code, message }, meta: null };
}

function profileView(kind: "business" | "brand", draft: unknown) {
  return { kind, status: "draft" as const, activeVersion: null, draft };
}

function client(
  handler: (path: string, method: string, body: unknown) => Envelope<unknown> | Promise<Envelope<unknown>>,
): { api: ApiClient; calls: Call[] } {
  const calls: Call[] = [];
  const api = (async (path: string, options?: { method?: string; body?: unknown }) => {
    const method = options?.method ?? "GET";
    calls.push({ path, method, body: options?.body });
    return handler(path, method, options?.body);
  }) as ApiClient;
  return { api, calls };
}

describe("customer profiles", () => {
  afterEach(() => cleanup());

  it("hides the form when specialist_config is off", async () => {
    let finish: (value: Envelope<Record<string, boolean>>) => void = () => undefined;
    const features = new Promise<Envelope<Record<string, boolean>>>((resolve) => {
      finish = resolve;
    });
    const { api, calls } = client((path) => {
      if (path === "/api/v1/me/features") return features;
      return fail("unexpected", path);
    });
    render(<CustomerProfiles api={api} workspaces={workspaces} />);
    expect(screen.queryByRole("heading", { name: "Profiles" })).toBeNull();
    await act(async () => {
      finish(ok({ specialist_config: false }));
      await features;
    });
    expect(screen.queryByRole("heading", { name: "Profiles" })).toBeNull();
    expect(screen.queryByLabelText("Company description")).toBeNull();
    expect(calls.some((call) => call.path.includes("/profiles/"))).toBe(false);
  });

  it("shows the API error when publish fails", async () => {
    const { api } = client((path, method) => {
      if (path === "/api/v1/me/features") return ok({ specialist_config: true });
      if (method === "GET" && path.endsWith("/profiles/business")) return ok(profileView("business", businessDraft));
      if (method === "GET" && path.endsWith("/profiles/brand")) return ok(profileView("brand", brandDraft));
      if (method === "POST") return fail("validation_error", "Profile draft is invalid");
      return ok(profileView("business", businessDraft));
    });
    render(<CustomerProfiles api={api} workspaces={workspaces} />);
    fireEvent.click(await screen.findByRole("button", { name: "Publish business profile" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Profile draft is invalid");
  });

  it("lets a specialist edit and publish both profiles", async () => {
    const { api, calls } = client((path, method, body) => {
      if (path === "/api/v1/me/features") return ok({ specialist_config: true });
      if (method === "GET" && path.endsWith("/profiles/business")) return ok(profileView("business", businessDraft));
      if (method === "GET" && path.endsWith("/profiles/brand")) return ok(profileView("brand", brandDraft));
      if (method === "PUT" && path.endsWith("/profiles/business")) {
        return ok({ ...profileView("business", body), status: "draft" });
      }
      if (method === "PUT" && path.endsWith("/profiles/brand")) {
        return ok({ ...profileView("brand", body), status: "draft" });
      }
      if (method === "POST" && path.endsWith("/profiles/business/publish")) {
        return ok({ kind: "business", version: 1, status: "published" });
      }
      if (method === "POST" && path.endsWith("/profiles/brand/publish")) {
        return ok({ kind: "brand", version: 1, status: "published" });
      }
      return fail("unexpected", path);
    });
    render(<CustomerProfiles api={api} workspaces={workspaces} />);
    const business = within(await screen.findByRole("group", { name: "Business profile" }));
    const brand = within(screen.getByRole("group", { name: "Brand profile" }));
    fireEvent.change(business.getByLabelText("Company description"), {
      target: { value: "Acme sells workflow software. Edited." },
    });
    fireEvent.click(business.getByRole("button", { name: "Save business draft" }));
    expect((await business.findByRole("status")).textContent).toContain("Draft saved.");
    fireEvent.click(business.getByRole("button", { name: "Publish business profile" }));
    expect((await business.findByRole("status")).textContent).toContain("Published version 1.");
    fireEvent.change(brand.getByLabelText("Positioning"), {
      target: { value: "The operating system for a marketing team. Edited." },
    });
    fireEvent.click(brand.getByRole("button", { name: "Publish brand profile" }));
    expect((await brand.findByRole("status")).textContent).toContain("Published version 1.");

    const editedBusiness = { ...businessDraft, companyDescription: "Acme sells workflow software. Edited." };
    const editedBrand = { ...brandDraft, positioning: "The operating system for a marketing team. Edited." };
    const businessPath = `/api/v1/workspaces/${workspaceId}/profiles/business`;
    const brandPath = `/api/v1/workspaces/${workspaceId}/profiles/brand`;
    expect(calls.filter((call) => call.method === "PUT")).toEqual([
      { path: businessPath, method: "PUT", body: editedBusiness },
      { path: businessPath, method: "PUT", body: editedBusiness },
      { path: brandPath, method: "PUT", body: editedBrand },
    ]);
    expect(calls.filter((call) => call.method === "POST").map((call) => call.path)).toEqual([
      `${businessPath}/publish`,
      `${brandPath}/publish`,
    ]);
  });
});
