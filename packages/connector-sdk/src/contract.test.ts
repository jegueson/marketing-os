import { describe, expect, it } from "vitest";
import { ConnectorError } from "./errors";
import { connectorMetadataSchema } from "./models";

describe("connector-sdk", () => {
  it("parses metadata", () => {
    const meta = connectorMetadataSchema.parse({
      slug: "mock",
      name: "Mock",
      version: "0.0.1",
      capabilities: ["read"],
    });
    expect(meta.slug).toBe("mock");
  });

  it("exposes typed connector errors", () => {
    const err = new ConnectorError("boom", "provider_error", true);
    expect(err.retryable).toBe(true);
    expect(err.code).toBe("provider_error");
  });
});
