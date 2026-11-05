"use client";

import Link from "next/link";
import { Button } from "@marketing-os/ui";
import { RequireAuth, type ReadyAuth } from "@/components/auth";
import { useApi } from "@/components/api-view";

function ConsoleHome({ auth }: { auth: ReadyAuth }) {
  const [features] = useApi<Record<string, boolean>>(auth.api, "/api/v1/me/features");
  return (
    <>
      <p>
        Signed in as {auth.me.email} ({auth.me.staffRole})
      </p>
      <ul>
        {features.status === "ready" && features.data["nav.leads_admin"] ? (
          <li>
            <Link href="/console/leads">Leads</Link>
          </li>
        ) : null}
        <li>
          <Link href="/console/customers">Customers</Link>
        </li>
      </ul>
      <Button onClick={() => void auth.signOut()}>Sign out</Button>
    </>
  );
}

export default function ConsoleHomePage() {
  return (
    <main>
      <h1>Specialist console</h1>
      <RequireAuth staff>{(auth) => <ConsoleHome auth={auth} />}</RequireAuth>
    </main>
  );
}
