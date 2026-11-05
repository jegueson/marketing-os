"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button, ErrorState, Table } from "@marketing-os/ui";
import { RequireAuth, type ReadyAuth } from "@/components/auth";
import { useApi, View } from "@/components/api-view";

type Overview = {
  tenant: { id: string; name: string; status: string };
  workspaces: { id: string; name: string }[];
  lead: { id: string; email: string } | null;
  discovery: {
    title: string;
    businessProblems: string | null;
    pilotObjectives: string | null;
  } | null;
  onboarding: {
    workspaceId: string;
    status?: string;
    items?: { key: string; title: string; status: string }[];
  }[];
  connections: { id: string; connector: string; displayName: string; status: string }[];
  invitations: { id: string; email: string; status: string; expiresAt: string }[];
};

type AuditRow = { id: number; eventType: string; actorRole: string | null; createdAt: string };

function Customer({ auth, tenantId }: { auth: ReadyAuth; tenantId: string }) {
  const base = `/api/v1/console/customers/${tenantId}`;
  const [state, reload] = useApi<Overview>(auth.api, base);
  const [audit] = useApi<AuditRow[]>(auth.api, `${base}/audit`);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function invitation(id: string, action: "resend" | "revoke") {
    const res = await auth.api<{ emailDelivery?: string }>(`${base}/invitations/${id}/${action}`, {
      method: "POST",
    });
    setMessage(
      res.success
        ? {
            ok: true,
            text:
              action === "resend"
                ? `Invitation resent (${res.data?.emailDelivery ?? "sent"}).`
                : "Invitation revoked.",
          }
        : { ok: false, text: res.error?.message ?? "Action failed" },
    );
    await reload();
  }

  return (
    <View state={state}>
      {(o) => (
        <>
          <h1>{o.tenant.name}</h1>
          {message ? (
            message.ok ? (
              <p role="status">{message.text}</p>
            ) : (
              <ErrorState title="Action failed" body={message.text} />
            )
          ) : null}
          <p>Status: {o.tenant.status}</p>
          {o.lead ? (
            <Link href={`/console/leads/${o.lead.id}`}>Original lead ({o.lead.email})</Link>
          ) : null}

          <h2>Discovery</h2>
          {o.discovery ? (
            <p>
              {o.discovery.title}: {o.discovery.businessProblems ?? "no problems recorded"}. Pilot:{" "}
              {o.discovery.pilotObjectives ?? "not set"}
            </p>
          ) : (
            <p>No discovery record.</p>
          )}

          <h2>Onboarding</h2>
          {o.onboarding.map((p) => (
            <div key={p.workspaceId}>
              <p>Project status: {p.status ?? "not started"}</p>
              <ul>
                {(p.items ?? []).map((i) => (
                  <li key={i.key}>
                    {i.title}: {i.status}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <h2>Connections</h2>
          {o.connections.length === 0 ? (
            <p>No connections yet.</p>
          ) : (
            <Table
              headers={["Connector", "Name", "Status"]}
              rows={o.connections.map((c) => [c.connector, c.displayName, c.status])}
            />
          )}

          <h2>Invitations</h2>
          <Table
            headers={["Email", "Status", "Expires", ""]}
            rows={o.invitations.map((i) => [
              i.email,
              i.status,
              new Date(i.expiresAt).toLocaleString(),
              i.status === "pending" ? (
                <span key="a">
                  <Button onClick={() => void invitation(i.id, "resend")}>Resend</Button>{" "}
                  <Button onClick={() => void invitation(i.id, "revoke")}>Revoke</Button>
                </span>
              ) : null,
            ])}
          />

          <h2>Audit log</h2>
          <View state={audit}>
            {(rows) => (
              <Table
                headers={["When", "Event", "Actor role"]}
                rows={rows.map((r) => [
                  new Date(r.createdAt).toLocaleString(),
                  r.eventType,
                  r.actorRole ?? "system",
                ])}
              />
            )}
          </View>
        </>
      )}
    </View>
  );
}

export default function CustomerPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  return (
    <main>
      <Link href="/console/customers">All customers</Link>
      <RequireAuth staff>{(auth) => <Customer auth={auth} tenantId={tenantId} />}</RequireAuth>
    </main>
  );
}
