import { describe, expect, it } from "vitest";
import { assertSafeModelEndpoint, assertSafeRedirect } from "./endpoint-guard";
import { ModelGatewayError } from "./errors";

describe("assertSafeModelEndpoint", () => {
  it("refuses cloud http and private/metadata targets", () => {
    const cloud = { deploymentMode: "cloud" as const };
    expect(() => assertSafeModelEndpoint("http://api.openai.com/v1", cloud)).toThrow(ModelGatewayError);
    expect(() => assertSafeModelEndpoint("https://127.0.0.1/v1", cloud)).toThrow(/private/i);
    expect(() => assertSafeModelEndpoint("https://localhost:11434/v1", cloud)).toThrow(/private/i);
    expect(() => assertSafeModelEndpoint("https://10.0.0.5/v1", cloud)).toThrow(/private/i);
    expect(() => assertSafeModelEndpoint("https://192.168.1.10/v1", cloud)).toThrow(/private/i);
    expect(() => assertSafeModelEndpoint("https://172.16.0.1/v1", cloud)).toThrow(/private/i);
    expect(() => assertSafeModelEndpoint("http://169.254.169.254/latest", cloud)).toThrow();
    expect(() => assertSafeModelEndpoint("https://169.254.169.254/latest", cloud)).toThrow(/blocked/i);
    expect(() => assertSafeModelEndpoint("https://metadata.google.internal/", cloud)).toThrow(/blocked/i);
  });

  it("allows public https in cloud", () => {
    const url = assertSafeModelEndpoint("https://api.openai.com/v1", { deploymentMode: "cloud" });
    expect(url.hostname).toBe("api.openai.com");
  });

  it("allows localhost in self-host only with the private-endpoints flag", () => {
    expect(() =>
      assertSafeModelEndpoint("http://localhost:11434/v1", {
        deploymentMode: "self_hosted",
        allowPrivateEndpoints: false,
      }),
    ).toThrow(/MOS_MODEL_ALLOW_PRIVATE_ENDPOINTS/);

    const url = assertSafeModelEndpoint("http://localhost:11434/v1", {
      deploymentMode: "self_hosted",
      allowPrivateEndpoints: true,
    });
    expect(url.host).toBe("localhost:11434");
  });

  it("refuses credentials in the URL", () => {
    expect(() =>
      assertSafeModelEndpoint("https://user:pass@api.openai.com/v1", { deploymentMode: "cloud" }),
    ).toThrow(/credentials/i);
  });

  it("refuses a redirect to a private IP or another origin", () => {
    const base = new URL("https://cdn.example.com/v1");
    expect(() =>
      assertSafeRedirect("https://169.254.169.254/latest", base, { deploymentMode: "cloud" }),
    ).toThrow();
    expect(() =>
      assertSafeRedirect("https://api.example.com/v1", base, { deploymentMode: "cloud" }),
    ).toThrow(/Cross-origin/);
    expect(() =>
      assertSafeRedirect("http://cdn.example.com/v1", base, { deploymentMode: "cloud" }),
    ).toThrow(/Cross-origin|HTTPS to HTTP/i);
  });

  it("blocks IPv6-mapped loopback and metadata forms in cloud", () => {
    const cloud = { deploymentMode: "cloud" as const };
    expect(() => assertSafeModelEndpoint("https://[::ffff:127.0.0.1]/", cloud)).toThrow();
    expect(() => assertSafeModelEndpoint("https://[::ffff:169.254.169.254]/", cloud)).toThrow();
    expect(() => assertSafeModelEndpoint("https://[::ffff:10.0.0.1]/", cloud)).toThrow();
    expect(() => assertSafeModelEndpoint("https://[fe80::1]/", cloud)).toThrow();
    expect(() => assertSafeModelEndpoint("https://100.64.0.1/", cloud)).toThrow();
  });
});
