"use client";

import { useState } from "react";
import { Button, EmptyState, ErrorState, Table } from "@marketing-os/ui";
import { RequireAuth, type ReadyAuth } from "@/components/auth";
import { useApi, View } from "@/components/api-view";
import { PortalFrame } from "@/components/workspace";
import type { Membership } from "@/lib/workspace";

type CatalogEntry = {
  slug: string;
  name: string;
  category: string;
  status: "available" | "beta" | "coming_soon";
};
type Connection = {
  id: string;
  connector: string;
  displayName: string;
  status: string;
  errorMessage: string | null;
  scopes: number;
};
type ResourceOption = {
  resourceType: string;
  resourceId: string;
  resourceName: string;
  selected: boolean;
};

const MANAGERS = new Set(["customer_admin", "platform_admin", "success_manager", "ai_specialist"]);

/** Stepper for one connection: choose accounts, save scopes, run the test. */
function ConnectionSetup({
  auth,
  base,
  connection,
  onChange,
}: {
  auth: ReadyAuth;
  base: string;
  connection: Connection;
  onChange: () => Promise<void>;
}) {
  const [resources] = useApi<ResourceOption[]>(
    auth.api,
    `${base}/connections/${connection.id}/resources`,
  );
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const selected = (options: ResourceOption[]) =>
    chosen ??
    new Set(options.filter((o) => o.selected).map((o) => `${o.resourceType}:${o.resourceId}`));

  async function saveAndTest(options: ResourceOption[]) {
    setMessage(null);
    const keys = selected(options);
    const scopes = await auth.api(`${base}/connections/${connection.id}/scopes`, {
      method: "PUT",
      body: {
        resources: options
          .filter((o) => keys.has(`${o.resourceType}:${o.resourceId}`))
          .map((o) => ({
            resourceType: o.resourceType,
            resourceId: o.resourceId,
            resourceName: o.resourceName,
          })),
      },
    });
    if (!scopes.success) {
      setMessage({ ok: false, text: scopes.error?.message ?? "Could not save the selection" });
      return;
    }
    const test = await auth.api(`${base}/connections/${connection.id}/test`, { method: "POST" });
    setMessage(
      test.success
        ? { ok: true, text: "Connected. Data health is now live." }
        : { ok: false, text: test.error?.message ?? "Connection test failed" },
    );
    await onChange();
  }

  return (
    <section aria-label={`Set up ${connection.displayName}`}>
      <h3>
        {connection.displayName} ({connection.status})
      </h3>
      {connection.errorMessage ? (
        <ErrorState title="Last test failed" body={connection.errorMessage} />
      ) : null}
      <View state={resources}>
        {(options) => {
          const keys = selected(options);
          return (
            <>
              <p>Step 2: choose what Marketing OS may read. Nothing is selected by default.</p>
              {options.map((o) => {
                const key = `${o.resourceType}:${o.resourceId}`;
                return (
                  <label key={key} style={{ display: "block" }}>
                    <input
                      type="checkbox"
                      checked={keys.has(key)}
                      onChange={(e) => {
                        const next = new Set(keys);
                        if (e.target.checked) next.add(key);
                        else next.delete(key);
                        setChosen(next);
                      }}
                    />{" "}
                    {o.resourceName} ({o.resourceType})
                  </label>
                );
              })}
              <Button onClick={() => void saveAndTest(options)}>
                Step 3: save and test connection
              </Button>
            </>
          );
        }}
      </View>
      {message ? (
        message.ok ? (
          <p role="status">{message.text}</p>
        ) : (
          <ErrorState title="Not connected" body={message.text} />
        )
      ) : null}
    </section>
  );
}

function Integrations({ auth, ws }: { auth: ReadyAuth; ws: Membership }) {
  const base = `/api/v1/workspaces/${ws.workspaceId}`;
  const [catalog] = useApi<CatalogEntry[]>(auth.api, `${base}/integrations`);
  const [connections, reload] = useApi<Connection[]>(auth.api, `${base}/connections`);
  const [error, setError] = useState<string | null>(null);
  const canManage = MANAGERS.has(ws.role);

  async function connect(entry: CatalogEntry) {
    setError(null);
    const res = await auth.api(`${base}/connections`, {
      method: "POST",
      body: { connectorSlug: entry.slug, displayName: entry.name },
    });
    if (!res.success) setError(res.error?.message ?? "Could not start the connection");
    await reload();
  }

  async function remove(id: string) {
    const res = await auth.api(`${base}/connections/${id}`, { method: "DELETE" });
    if (!res.success) setError(res.error?.message ?? "Could not remove the connection");
    await reload();
  }

  return (
    <>
      {error ? <ErrorState title="Something went wrong" body={error} /> : null}
      <h2>Step 1: pick a source</h2>
      <View state={catalog}>
        {(entries) => (
          <Table
            headers={["Source", "Category", "Status", ""]}
            rows={entries.map((e) => [
              e.name,
              e.category,
              e.status === "available" ? "Available" : e.status === "beta" ? "Beta" : "Coming soon",
              e.status === "available" && canManage ? (
                <Button key="c" onClick={() => void connect(e)}>
                  Connect
                </Button>
              ) : null,
            ])}
          />
        )}
      </View>
      <h2>Your connections</h2>
      <View state={connections}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState title="No connections" body="Connect a source above to start onboarding." />
          ) : (
            <>
              {rows.map((c) => (
                <div key={c.id}>
                  {canManage && c.status !== "active" ? (
                    <ConnectionSetup auth={auth} base={base} connection={c} onChange={reload} />
                  ) : (
                    <p>
                      {c.displayName}: {c.status}, {c.scopes} resources selected
                    </p>
                  )}
                  {canManage ? <Button onClick={() => void remove(c.id)}>Remove</Button> : null}
                </div>
              ))}
            </>
          )
        }
      </View>
    </>
  );
}

export default function IntegrationsPage() {
  return (
    <main>
      <h1>Integrations</h1>
      <RequireAuth>
        {(auth) => (
          <PortalFrame me={auth.me}>{(ws) => <Integrations auth={auth} ws={ws} />}</PortalFrame>
        )}
      </RequireAuth>
    </main>
  );
}
