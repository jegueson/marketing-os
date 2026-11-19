import type { DeploymentMode } from "./endpoint-guard";

const BEARER = /Bearer\s+\S+/gi;
const KEY_PATTERN = /\bsk-(?:or-|ant-)?[A-Za-z0-9_-]{4,}\b/g;

/** Strip `sk-` / `sk-or-` / `sk-ant-` keys, Bearer tokens, and the exact configured key. */
export function redactSecrets(text: string, apiKey?: string): string {
  let out = text.replace(BEARER, "Bearer [redacted]").replace(KEY_PATTERN, "[redacted]");
  if (apiKey && apiKey.length >= 4) {
    out = out.split(apiKey).join("[redacted]");
  }
  return out;
}

export type GatewayLogContext = {
  provider: string;
  deploymentMode: DeploymentMode;
  /** True only when the process set `MOS_MODEL_DEBUG=1`. Cloud still suppresses prompt bodies. */
  modelDebug: boolean;
};

/** Prompt text is logged only for a self-hosted install that opted in. */
export function promptDebugAllowed(log: GatewayLogContext | undefined): boolean {
  return log !== undefined && log.deploymentMode !== "cloud" && log.modelDebug;
}

export function logGatewayFailure(input: {
  provider: string;
  status?: number | undefined;
  message: string;
  apiKey?: string | undefined;
}): void {
  console.error(
    JSON.stringify({
      level: "error",
      message: "model gateway request failed",
      provider: input.provider,
      status: input.status ?? null,
      error: redactSecrets(input.message, input.apiKey),
    }),
  );
}

/** Logs the request body only when prompt debug is allowed. Secrets in that body are still redacted. */
export function logPromptDebug(log: GatewayLogContext | undefined, body: string, apiKey?: string | undefined): void {
  if (!promptDebugAllowed(log) || !log) return;
  console.info(
    JSON.stringify({
      level: "debug",
      message: "model gateway prompt",
      provider: log.provider,
      body: redactSecrets(body, apiKey),
    }),
  );
}
