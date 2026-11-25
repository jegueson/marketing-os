"use client";

import { RequireAuth } from "@/components/auth";
import { ModelSettings } from "@/components/model-settings";
import { PortalFrame } from "@/components/workspace";

export default function ModelSettingsPage() {
  return (
    <RequireAuth>
      {(auth) => (
        <PortalFrame
          me={auth.me}
          api={auth.api}
          title="Model settings"
          onSignOut={() => void auth.signOut()}
        >
          {(ws) => <ModelSettings api={auth.api} workspaceId={ws.workspaceId} role={ws.role} />}
        </PortalFrame>
      )}
    </RequireAuth>
  );
}
