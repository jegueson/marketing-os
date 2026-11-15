export const modelGatewayErrorCodes = [
  "auth_failed",
  "rate_limited",
  "context_length",
  "provider_unavailable",
  "budget_exceeded",
  "unsupported_capability",
  "invalid_request",
  "model_not_found",
] as const;

export type ModelGatewayErrorCode = (typeof modelGatewayErrorCodes)[number];

export class ModelGatewayError extends Error {
  constructor(
    message: string,
    readonly code: ModelGatewayErrorCode,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ModelGatewayError";
  }
}
