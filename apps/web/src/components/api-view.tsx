"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { EmptyState, ErrorState } from "@marketing-os/ui";
import type { ApiClient, Envelope } from "@/lib/api";

export type Loaded<T> =
  | { status: "loading" }
  | { status: "error"; message: string; code: string }
  | { status: "ready"; data: T; meta: Envelope<T>["meta"] };

/** GET `path` on mount and whenever `reload` is called. */
export function useApi<T>(api: ApiClient, path: string | null): [Loaded<T>, () => Promise<void>] {
  const [state, setState] = useState<Loaded<T>>({ status: "loading" });
  const reload = useCallback(async () => {
    if (!path) return;
    const res = await api<T>(path);
    if (res.success && res.data !== null) {
      setState({ status: "ready", data: res.data, meta: res.meta });
    } else {
      setState({
        status: "error",
        code: res.error?.code ?? "unknown",
        message: res.error?.message ?? "Request failed",
      });
    }
  }, [api, path]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return [state, reload];
}

export function View<T>({
  state,
  children,
}: {
  state: Loaded<T>;
  children: (data: T) => ReactNode;
}) {
  if (state.status === "loading") return <p role="status">Loading…</p>;
  if (state.status === "error") {
    if (state.code === "not_found") return <EmptyState title="Not found" body={state.message} />;
    return <ErrorState title="Could not load" body={state.message} />;
  }
  return <>{children(state.data)}</>;
}
