"use client";

import { RequireAuth, accessToken } from "@/components/auth";
import { AskHome } from "@/components/ask-home";
import { PortalFrame } from "@/components/workspace";

export default function AskPage() {
  return (
    <RequireAuth>
      {(auth) => (
        <PortalFrame me={auth.me} api={auth.api} title="Ask" onSignOut={() => void auth.signOut()}>
          {(ws) => (
            <AskHome api={auth.api} workspaceId={ws.workspaceId} role={ws.role} getToken={accessToken} />
          )}
        </PortalFrame>
      )}
    </RequireAuth>
  );
}
