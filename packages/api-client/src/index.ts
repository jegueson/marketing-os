import { parseEnvelope, type Envelope } from "./envelope";

export type { Envelope } from "./envelope";
export { parseEnvelope } from "./envelope";
export type { paths, components, operations } from "./generated/schema";

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
};

export type ApiClient = <T>(path: string, options?: RequestOptions) => Promise<Envelope<T>>;

export type ApiClientOptions = {
  baseUrl: string;
  getAccessToken?: () => Promise<string | null | undefined>;
  fetch?: typeof fetch;
};

function failure<T>(code: string, message: string): Envelope<T> {
  return { success: false, data: null, error: { code, message }, meta: null };
}

export function apiBaseUrl(): string {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  return "http://127.0.0.1:8787";
}

/**
 * Typed envelope client generated against packages/openapi/openapi.json.
 * Path strings stay free-form for the portal; response envelopes are always validated.
 */
export function createApiClient(
  getToken: () => Promise<string | null | undefined> = async () => null,
  baseUrl: string = apiBaseUrl(),
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): ApiClient {
  return async <T>(path: string, options: RequestOptions = {}) => {
    const headers: Record<string, string> = {};
    const token = await getToken();
    if (token) headers.authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers["content-type"] = "application/json";

    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });
    } catch (err) {
      console.error("API request failed", path, err);
      return failure<T>(
        "network_error",
        "Could not reach the server. Check your connection and retry.",
      );
    }

    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      return failure<T>("bad_response", `Unexpected response from the server (${res.status}).`);
    }

    try {
      return parseEnvelope(payload) as Envelope<T>;
    } catch {
      return failure<T>("bad_response", `Unexpected response from the server (${res.status}).`);
    }
  };
}

/** Public endpoints (lead form) need no token. */
export const publicApi: ApiClient = createApiClient(async () => null);

/** Back-compat options object used by early api-client tests. */
export function createApiClientFromOptions(options: ApiClientOptions): {
  healthz: () => Promise<Envelope<{ status: string }>>;
  request: ApiClient;
} {
  const request = createApiClient(
    options.getAccessToken ?? (async () => undefined),
    options.baseUrl,
    options.fetch,
  );
  return {
    request,
    healthz: () => request<{ status: string }>("/healthz"),
  };
}
