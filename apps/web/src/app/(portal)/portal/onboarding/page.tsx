"use client";

import { useState } from "react";
import { Button, ErrorState } from "@marketing-os/ui";
import { RequireAuth, type ReadyAuth } from "@/components/auth";
import { useApi, View } from "@/components/api-view";
import { PortalFrame } from "@/components/workspace";
import type { Membership } from "@/lib/workspace";

type Onboarding = {
  status: string;
  items: { id: string; key: string; title: string; description: string | null; status: string }[];
};

const MANAGERS = new Set(["customer_admin", "platform_admin", "success_manager", "ai_specialist"]);

function Checklist({ auth, ws }: { auth: ReadyAuth; ws: Membership }) {
  const path = `/api/v1/workspaces/${ws.workspaceId}/onboarding`;
  const [state, reload] = useApi<Onboarding>(auth.api, path);
  const [error, setError] = useState<string | null>(null);
  const canManage = MANAGERS.has(ws.role);

  async function setStatus(itemId: string, status: string) {
    setError(null);
    const res = await auth.api(`${path}/items/${itemId}`, { method: "PATCH", body: { status } });
    if (!res.success) setError(res.error?.message ?? "Update failed");
    await reload();
  }

  return (
    <View state={state}>
      {(o) => {
        const done = o.items.filter(
          (i) => i.status === "completed" || i.status === "skipped",
        ).length;
        return (
          <>
            {error ? <ErrorState title="Could not update" body={error} /> : null}
            <p>
              {done} of {o.items.length} done · project {o.status}
            </p>
            <ol>
              {o.items.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong> ({item.status})
                  {item.description ? <p>{item.description}</p> : null}
                  {canManage && item.status !== "completed" && item.key !== "connect_source" ? (
                    <Button onClick={() => void setStatus(item.id, "completed")}>Mark done</Button>
                  ) : null}
                  {item.key === "connect_source" && item.status !== "completed" ? (
                    <p>Completes automatically when a data source connects.</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </>
        );
      }}
    </View>
  );
}

export default function OnboardingPage() {
  return (
    <main>
      <h1>Onboarding</h1>
      <RequireAuth>
        {(auth) => (
          <PortalFrame me={auth.me}>{(ws) => <Checklist auth={auth} ws={ws} />}</PortalFrame>
        )}
      </RequireAuth>
    </main>
  );
}
