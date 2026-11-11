import { describe, expect, it } from "vitest";
import { formatLogLine, redactPii } from "./telemetry";

describe("telemetry redaction", () => {
  it("redacts emails and tokens", () => {
    expect(redactPii("user ada@acme.test token=abc123")).toContain("[redacted-email]");
    expect(redactPii("Authorization Bearer abc.def.ghi")).toContain("[redacted-token]");
    const line = formatLogLine({
      level: "error",
      message: "oauth refresh_token=ya29.fixture-token failed",
      access_token: "ya29.fixture-token",
    });
    expect(line).not.toContain("ya29.fixture-token");
  });

  it("includes request and tenant ids", () => {
    const line = formatLogLine({
      level: "info",
      message: "ok",
      requestId: "r1",
      tenantId: "t1",
      userId: "u1",
    });
    expect(line).toContain("r1");
    expect(line).toContain("t1");
    expect(line).toContain("u1");
  });
});
