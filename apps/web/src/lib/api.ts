const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8787";

export type Envelope<T> = {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
  meta: Record<string, unknown> | null;
};

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { headers?: HeadersInit },
): Promise<Envelope<T>> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return (await res.json()) as Envelope<T>;
}
