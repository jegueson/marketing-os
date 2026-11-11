import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { contentSecurityPolicy, createNonce, cspAllowsTurnstile } from "./csp";
import { middleware } from "../middleware";

describe("contentSecurityPolicy", () => {
  it("includes a nonce and allows the Turnstile widget", () => {
    const nonce = createNonce();
    const policy = contentSecurityPolicy({
      nonce,
      connectUrls: ["http://127.0.0.1:8787", "http://127.0.0.1:54321"],
    });
    expect(policy).toContain(`'nonce-${nonce}'`);
    expect(cspAllowsTurnstile(policy)).toBe(true);
    expect(policy).toContain("http://127.0.0.1:8787");
    expect(policy).toContain("ws://127.0.0.1:54321");
    expect(policy).not.toContain("upgrade-insecure-requests");
    expect(policy).not.toContain("'unsafe-eval'");
  });

  it("adds unsafe-eval only in development and upgrades on https", () => {
    const policy = contentSecurityPolicy({ nonce: "abc", dev: true, https: true });
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain("upgrade-insecure-requests");
  });
});

describe("csp middleware", () => {
  it("sets a per-request CSP nonce on the document response", () => {
    const request = new NextRequest("http://127.0.0.1:3000/get-started");
    const response = middleware(request);
    const policy = response.headers.get("content-security-policy") ?? "";
    const nonce = response.headers.get("x-nonce");
    expect(nonce).toBeTruthy();
    expect(policy).toContain(`'nonce-${nonce}'`);
    expect(cspAllowsTurnstile(policy)).toBe(true);
    expect(policy).not.toBe(middleware(request).headers.get("content-security-policy"));
  });
});
