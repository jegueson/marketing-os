"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, ErrorState, Form, Input } from "@marketing-os/ui";
import { useAuth } from "@/components/auth";
import { getSupabase } from "@/lib/supabase";
import { homeFor, safeNext } from "@/lib/workspace";

export default function LoginPage() {
  const auth = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (auth.status !== "ready") return;
    void auth.api("/api/v1/me/login", { method: "POST" }).then((res) => {
      if (!res.success) console.error("login audit failed", res.error);
    });
    router.replace(next ?? homeFor(auth.me));
  }, [auth, next, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    try {
      const supabase = getSupabase();
      const result =
        mode === "sign_in"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });
      if (result.error) {
        setError(result.error.message);
      } else if (mode === "sign_up" && !result.data.session) {
        setNotice("Check your email to confirm your address, then sign in.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>{mode === "sign_in" ? "Sign in" : "Create your account"}</h1>
      {next?.startsWith("/invite/") ? (
        <p>Use the email address that received the invitation.</p>
      ) : null}
      {error ? <ErrorState title="Could not sign in" body={error} /> : null}
      {notice ? <p role="status">{notice}</p> : null}
      <Form onSubmit={onSubmit}>
        <Input label="Email" name="email" type="email" autoComplete="email" required />
        <Input
          label="Password"
          name="password"
          type="password"
          minLength={8}
          autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
          required
        />
        <Button type="submit" disabled={busy}>
          {mode === "sign_in" ? "Sign in" : "Create account"}
        </Button>
      </Form>
      <Button onClick={() => setMode(mode === "sign_in" ? "sign_up" : "sign_in")}>
        {mode === "sign_in" ? "New here? Create an account" : "Have an account? Sign in"}
      </Button>
    </main>
  );
}
