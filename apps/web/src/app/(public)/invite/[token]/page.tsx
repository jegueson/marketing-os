"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ErrorState } from "@marketing-os/ui";
import { RequireAuth, type ReadyAuth } from "@/components/auth";

type Result =
  | { status: "pending" }
  | { status: "accepted"; tenantId: string }
  | { status: "failed"; message: string };

function Accept({ auth, token }: { auth: ReadyAuth; token: string }) {
  const [result, setResult] = useState<Result>({ status: "pending" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void auth
      .api<{ tenantId: string }>("/api/v1/invitations/accept", { method: "POST", body: { token } })
      .then(async (res) => {
        if (res.success && res.data) {
          await auth.reload();
          setResult({ status: "accepted", tenantId: res.data.tenantId });
        } else {
          setResult({
            status: "failed",
            message: res.error?.message ?? "Invitation could not be accepted",
          });
        }
      });
  }, [auth, token]);

  if (result.status === "pending") return <p role="status">Accepting invitation…</p>;
  if (result.status === "failed") {
    return (
      <>
        <ErrorState title="Invitation not accepted" body={result.message} />
        <p>Signed in as {auth.me.email}.</p>
      </>
    );
  }
  const membership = auth.me.memberships.find((m) => m.tenantId === result.tenantId);
  return (
    <>
      <p role="status">You joined the workspace.</p>
      <Link href={membership ? `/portal/onboarding?ws=${membership.workspaceId}` : "/portal"}>
        Continue to onboarding
      </Link>
    </>
  );
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  return (
    <main>
      <h1>Accept invitation</h1>
      <RequireAuth>{(auth) => <Accept auth={auth} token={token} />}</RequireAuth>
    </main>
  );
}
