"use client";

import { RequireAuth } from "@/components/auth";
import { ApprovalsScreen } from "@/components/approvals-screen";
import { PortalFrame } from "@/components/workspace";

export default function ApprovalsPage() {
  return (
    <RequireAuth>
      {(auth) => (
        <PortalFrame
          me={auth.me}
          api={auth.api}
          title="Approvals"
          onSignOut={() => void auth.signOut()}
        >
          {(ws) => <ApprovalsScreen api={auth.api} workspaceId={ws.workspaceId} role={ws.role} />}
        </PortalFrame>
      )}
    </RequireAuth>
  );
}
