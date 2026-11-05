"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { ErrorState } from "@marketing-os/ui";
import { createApiClient, type ApiClient } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import type { Me } from "@/lib/workspace";

type AuthState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      me: Me;
      api: ApiClient;
      reload: () => Promise<void>;
      signOut: () => Promise<void>;
    };

const AuthContext = createContext<AuthState>({ status: "loading" });

async function accessToken(): Promise<string | null> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) {
    console.error("Supabase session error", error);
    return null;
  }
  return data.session?.access_token ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const api = useMemo(() => createApiClient(accessToken), []);

  const load = useCallback(async () => {
    let token: string | null;
    try {
      token = await accessToken();
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Sign-in is not configured",
      });
      return;
    }
    if (!token) {
      setState({ status: "signed_out" });
      return;
    }
    const res = await api<Me>("/api/v1/me");
    if (res.error?.code === "unauthorized") {
      setState({ status: "signed_out" });
      return;
    }
    if (!res.success || !res.data) {
      setState({ status: "error", message: res.error?.message ?? "Could not load your account" });
      return;
    }
    setState({
      status: "ready",
      me: res.data,
      api,
      reload: load,
      signOut: async () => {
        await getSupabase().auth.signOut();
        setState({ status: "signed_out" });
      },
    });
  }, [api]);

  useEffect(() => {
    void load();
    let unsubscribe: (() => void) | undefined;
    try {
      const { data } = getSupabase().auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN" || event === "SIGNED_OUT") void load();
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      // Missing config is already surfaced by load() as an error state.
    }
    return unsubscribe;
  }, [load]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export type ReadyAuth = Extract<AuthState, { status: "ready" }>;

/** Renders children only for a signed-in user; otherwise sends them to /login. */
export function RequireAuth({
  children,
  staff = false,
}: {
  children: (auth: ReadyAuth) => ReactNode;
  staff?: boolean;
}) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (auth.status === "signed_out") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [auth.status, pathname, router]);

  if (auth.status === "loading" || auth.status === "signed_out")
    return <p role="status">Loading…</p>;
  if (auth.status === "error")
    return <ErrorState title="Something went wrong" body={auth.message} />;
  if (staff && !auth.me.staffRole) {
    return <ErrorState title="Staff only" body="This area is for Marketing OS specialists." />;
  }
  return <>{children(auth)}</>;
}
