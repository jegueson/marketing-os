export type Envelope<T> = {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  meta: Record<string, unknown> | null;
};

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
};

export type ApiClient = <T>(path: string, options?: RequestOptions) => Promise<Envelope<T>>;

export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8787";
}

function failure<T>(code: string, message: string): Envelope<T> {
  return { success: false, data: null, error: { code, message }, meta: null };
}

/**
 * Calls the API with the caller's Supabase access token. Network errors and
 * non-JSON responses come back as failure envelopes so pages render one error path.
 */
export function createApiClient(
  getToken: () => Promise<string | null>,
  baseUrl: string = apiBaseUrl(),
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): ApiClient {
  return async <T>(path: string, options: RequestOptions = {}) => {
    const headers: Record<string, string> = {};
    const token = await getToken();
    if (token) headers["authorization"] = `Bearer ${token}`;
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
    try {
      return (await res.json()) as Envelope<T>;
    } catch {
      return failure<T>("bad_response", `Unexpected response from the server (${res.status}).`);
    }
  };
}

/** Public endpoints (lead form) need no token. */
export const publicApi: ApiClient = createApiClient(async () => null);
