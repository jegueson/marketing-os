"use client";

import Link from "next/link";
import type { CockpitView } from "@marketing-os/schemas";
import { EmptyState, Table } from "@marketing-os/ui";
import { RequireAuth, type ReadyAuth } from "@/components/auth";
import { useApi, View } from "@/components/api-view";
import { PortalFrame } from "@/components/workspace";
import type { Membership } from "@/lib/workspace";

function Cockpit({ auth, ws }: { auth: ReadyAuth; ws: Membership }) {
  const [state] = useApi<CockpitView>(auth.api, `/api/v1/workspaces/${ws.workspaceId}/cockpit`);
  return (
    <View state={state}>
      {(view) => (
        <>
          <p>
            {view.header.workspaceName} · {view.header.period.label} · data {view.header.freshness}
          </p>
          {view.empty_state ? (
            <>
              <EmptyState title="Nothing to show yet" body={view.empty_state.message} />
              <Link href={`/portal/integrations?ws=${ws.workspaceId}`}>Connect a data source</Link>
            </>
          ) : null}
          <h2>Performance</h2>
          <p>KPI cards arrive with the first real connectors.</p>
          <h2>Data health</h2>
          {view.data_health.length === 0 ? (
            <p>No sources connected.</p>
          ) : (
            <Table
              headers={["Source", "Connection", "Health", "Resources", "Last healthy", "Message"]}
              rows={view.data_health.map((d) => [
                d.displayName,
                d.status,
                d.health,
                String(d.scopes),
                d.lastHealthyAt ? new Date(d.lastHealthyAt).toLocaleString() : "never",
                d.message ?? "",
              ])}
            />
          )}
        </>
      )}
    </View>
  );
}

export default function CockpitPage() {
  return (
    <main>
      <h1>Cockpit</h1>
      <RequireAuth>
        {(auth) => (
          <PortalFrame me={auth.me}>{(ws) => <Cockpit auth={auth} ws={ws} />}</PortalFrame>
        )}
      </RequireAuth>
    </main>
  );
}
