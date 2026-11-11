const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BEARER = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const TOKENISH = /((?:refresh_|access_|id_)?(?:api[_-]?key|token|secret))([:=])([^\s&"',}]+)/gi;
const SENSITIVE_FIELD = /token|secret|password|authorization|ciphertext/i;

export function redactPii(value: string): string {
  return value
    .replace(EMAIL, "[redacted-email]")
    .replace(BEARER, "Bearer [redacted-token]")
    .replace(TOKENISH, "$1$2[redacted-token]");
}

export type LogFields = {
  level: "info" | "warn" | "error";
  message: string;
  requestId?: string;
  tenantId?: string;
  userId?: string;
  [key: string]: unknown;
};

export function formatLogLine(fields: LogFields): string {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string" && SENSITIVE_FIELD.test(key)) {
      safe[key] = "[redacted]";
    } else if (typeof value === "string") {
      safe[key] = redactPii(value);
    } else {
      safe[key] = value;
    }
  }
  return JSON.stringify(safe);
}
