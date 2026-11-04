export class ConnectorError extends Error {
  constructor(
    message: string,
    readonly code:
      | "auth_failed"
      | "rate_limited"
      | "not_found"
      | "invalid_input"
      | "provider_error"
      | "unsupported",
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}
