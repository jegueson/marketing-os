export type ApiClientOptions = {
  baseUrl: string;
  getAccessToken?: () => Promise<string | undefined>;
  fetch?: typeof fetch;
};

export type Envelope<T> = {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  meta: Record<string, unknown> | null;
};

/** Hand-maintained client until OpenAPI codegen (zod-openapi export) lands in CI. */
export function createApiClient(options: ApiClientOptions) {
  const doFetch = options.fetch ?? fetch;

  async function request<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
    const token = options.getAccessToken ? await options.getAccessToken() : undefined;
    const headers = new Headers(init?.headers);
    headers.set("content-type", "application/json");
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
    const res = await doFetch(`${options.baseUrl}${path}`, { ...init, headers });
    return (await res.json()) as Envelope<T>;
  }

  return {
    healthz: () => request<{ status: string }>("/healthz"),
    createPublicLead: (body: unknown) =>
      request<{ id: string }>("/api/v1/public/leads", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listLeads: () => request<unknown[]>("/api/v1/leads"),
    getCockpit: (workspaceId: string) =>
      request<unknown>(`/api/v1/workspaces/${workspaceId}/cockpit`),
  };
}
