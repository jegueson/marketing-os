"use client";

import Link from "next/link";
import { RequireAuth, type ReadyAuth } from "@/components/auth";
import { ConsoleFrame } from "@/components/console-frame";
import { useApi } from "@/components/api-view";

function ConsoleHome({ auth }: { auth: ReadyAuth }) {
  const [features] = useApi<Record<string, boolean>>(auth.api, "/api/v1/me/features");
  return (
    <section className="app-panel">
      <h2>Specialist workspace</h2>
      <p className="app-lede">
        Signed in as {auth.me.email} ({auth.me.staffRole}). Open a customer to edit profiles, skills,
        and weekly review workflows.
      </p>
      <ul className="app-nav" style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {features.status === "ready" && features.data["nav.leads_admin"] ? (
          <li>
            <Link href="/console/leads">Leads</Link>
          </li>
        ) : null}
        <li>
          <Link href="/console/customers">Customers</Link>
        </li>
      </ul>
    </section>
  );
}

export default function ConsoleHomePage() {
  return (
    <RequireAuth staff>
      {(auth) => (
        <ConsoleFrame auth={auth} title="Specialist console">
          <ConsoleHome auth={auth} />
        </ConsoleFrame>
      )}
    </RequireAuth>
  );
}
