import { describe, expect, it } from "vitest";
import { parseEnvelope } from "./envelope";

describe("parseEnvelope", () => {
  it("parses a success envelope", () => {
    const parsed = parseEnvelope({
      success: true,
      data: { status: "ok" },
      error: null,
      meta: null,
    });
    expect(parsed).toEqual({
      success: true,
      data: { status: "ok" },
      error: null,
      meta: null,
    });
  });

  it("parses an error envelope with details", () => {
    const parsed = parseEnvelope({
      success: false,
      data: null,
      error: { code: "validation_error", message: "Invalid", details: { fieldErrors: {} } },
      meta: null,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.code).toBe("validation_error");
      expect(parsed.error.details).toEqual({ fieldErrors: {} });
    }
  });

  it("rejects a malformed payload", () => {
    expect(() => parseEnvelope({ success: true, data: 1 })).toThrow(/envelope/i);
  });
});
