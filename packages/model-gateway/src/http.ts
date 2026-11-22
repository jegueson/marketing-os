import { assertSafeModelEndpoint, assertSafeRedirect, type EndpointGuardOptions } from "./endpoint-guard";
import { ModelGatewayError, type ModelGatewayErrorCode } from "./errors";
import { logGatewayFailure, logPromptDebug, redactSecrets, type GatewayLogContext } from "./log";

export { redactSecrets };

export type GatewayFetch = typeof fetch;

export function mapHttpStatus(status: number, bodyText: string, apiKey?: string): ModelGatewayError {
  const safe = redactSecrets(bodyText, apiKey);
  const lower = safe.toLowerCase();
  let code: ModelGatewayErrorCode = "provider_unavailable";
  let retryable = false;
  if (status === 401 || status === 403) code = "auth_failed";
  else if (status === 402) code = "budget_exceeded";
  else if (status === 404) code = "model_not_found";
  else if (status === 429) {
    code = "rate_limited";
    retryable = true;
  } else if (
    status === 400 &&
    (lower.includes("context") || lower.includes("maximum") || lower.includes("too long"))
  ) {
    code = "context_length";
  } else if (status === 400) code = "invalid_request";
  else if (status >= 500) {
    code = "provider_unavailable";
    retryable = true;
  }
  const message =
    code === "auth_failed"
      ? "Provider rejected credentials"
      : code === "budget_exceeded"
        ? "Provider reported insufficient credits"
        : code === "rate_limited"
          ? "Provider rate limit exceeded"
          : safe.slice(0, 300) || `Provider HTTP ${status}`;
  return new ModelGatewayError(message, code, retryable);
}

/** Map an in-band OpenRouter error.code (HTTP-like number) to a typed error. */
export function mapProviderErrorCode(
  status: number,
  message: string,
  apiKey?: string,
): ModelGatewayError {
  return mapHttpStatus(status, message, apiKey);
}

export type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal | undefined;
  timeoutMs?: number;
  apiKey?: string;
  /** How to send the API key. Default bearer (`Authorization`). Anthropic uses `x-api-key`. */
  authStyle?: "bearer" | "x-api-key";
  /**
   * Keep the timeout/abort controller alive after headers arrive.
   * Caller must call `release()` when the body is fully consumed.
   */
  holdUntilRelease?: boolean;
  /** When set, validate URL/redirects (manual redirect, one safe hop). */
  endpointGuard?: EndpointGuardOptions;
  /** Failure logs and the optional self-hosted prompt debug line. */
  log?: GatewayLogContext;
};

export type GatewayResponse = {
  response: Response;
  signal: AbortSignal;
  release: () => void;
};

/**
 * fetch wrapper with timeout, AbortSignal merge, and typed status mapping.
 * Never puts the API key into thrown errors.
 */
export async function gatewayFetch(
  fetchImpl: GatewayFetch,
  url: string,
  options: RequestOptions,
): Promise<GatewayResponse> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 60_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", onAbort, { once: true });
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  };

  try {
    if (controller.signal.aborted) {
      throw new ModelGatewayError("Request aborted or timed out", "provider_unavailable", true);
    }
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...options.headers,
    };
    if (options.apiKey) {
      if (options.authStyle === "x-api-key") {
        headers["x-api-key"] = options.apiKey;
      } else {
        headers.Authorization = `Bearer ${options.apiKey}`;
      }
    }
    let requestUrl = url;
    if (options.endpointGuard) {
      requestUrl = assertSafeModelEndpoint(url, options.endpointGuard).toString();
    }

    const init: RequestInit = {
      method: options.method ?? "GET",
      headers,
      signal: controller.signal,
      redirect: options.endpointGuard ? "manual" : "follow",
    };
    if (options.body !== undefined) {
      logPromptDebug(options.log, options.body, options.apiKey);
      init.body = options.body;
    }

    let response: Response;
    try {
      response = await fetchImpl(requestUrl, init);
      if (options.endpointGuard && isRedirectStatus(response.status)) {
        const location = response.headers.get("Location");
        if (!location) {
          throw new ModelGatewayError("Redirect missing Location header", "invalid_request");
        }
        const next = assertSafeRedirect(location, new URL(requestUrl), options.endpointGuard);
        response = await fetchImpl(next.toString(), { ...init, redirect: "error" });
      }
    } catch (err) {
      if (err instanceof ModelGatewayError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new ModelGatewayError("Request aborted or timed out", "provider_unavailable", true);
      }
      const message = err instanceof Error ? err.message : "Network error";
      logGatewayFailure({
        provider: options.log?.provider ?? "model-gateway",
        message,
        apiKey: options.apiKey,
      });
      throw new ModelGatewayError(
        redactSecrets(message, options.apiKey),
        "provider_unavailable",
        true,
      );
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logGatewayFailure({
        provider: options.log?.provider ?? "model-gateway",
        status: response.status,
        message: `HTTP ${response.status}`,
        apiKey: options.apiKey,
      });
      throw mapHttpStatus(response.status, text, options.apiKey);
    }
    if (!options.holdUntilRelease) release();
    return { response, signal: controller.signal, release };
  } catch (err) {
    release();
    throw err;
  }
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

export async function readJson<T>(response: Response, apiKey?: string): Promise<T> {
  let text: string;
  try {
    text = await response.text();
  } catch (err) {
    throw new ModelGatewayError(
      redactSecrets(err instanceof Error ? err.message : "Failed to read body", apiKey),
      "provider_unavailable",
      true,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ModelGatewayError("Provider returned invalid JSON", "provider_unavailable", true);
  }
}
