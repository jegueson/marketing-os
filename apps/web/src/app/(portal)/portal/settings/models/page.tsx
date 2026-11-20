"use client";

import { RequireAuth } from "@/components/auth";
import { ModelSettings } from "@/components/model-settings";
import { PortalFrame } from "@/components/workspace";

export default function ModelSettingsPage() {
  return (
    <main>
      <h1>Model settings</h1>
      <RequireAuth>
        {(auth) => (
          <PortalFrame me={auth.me} api={auth.api}>
            {(ws) => <ModelSettings api={auth.api} workspaceId={ws.workspaceId} role={ws.role} />}
          </PortalFrame>
        )}
      </RequireAuth>
    </main>
  );
}
