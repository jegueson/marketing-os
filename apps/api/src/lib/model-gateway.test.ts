import { describe, expect, it } from "vitest";
import { AppError } from "@marketing-os/core";
import { ModelGatewayError } from "@marketing-os/model-gateway";
import { mapGatewayError } from "./model-gateway";

describe("mapGatewayError", () => {
  it("maps a hard budget cap to HTTP 402", () => {
    expect(() => mapGatewayError(new ModelGatewayError("Monthly model budget exceeded", "budget_exceeded"))).toThrow(
      AppError,
    );
    try {
      mapGatewayError(new ModelGatewayError("Monthly model budget exceeded", "budget_exceeded"));
    } catch (err) {
      expect(err).toMatchObject({ code: "budget_exceeded", status: 402 });
    }
  });
});
