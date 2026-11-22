"use client";

import { RequireAuth, accessToken } from "@/components/auth";
import { AskHome } from "@/components/ask-home";
import { PortalFrame } from "@/components/workspace";

export default function AskPage() {
  return (
    <main>
      <h1>Ask</h1>
      <RequireAuth>
        {(auth) => (
          <PortalFrame me={auth.me} api={auth.api}>
            {(ws) => (
              <AskHome api={auth.api} workspaceId={ws.workspaceId} role={ws.role} getToken={accessToken} />
            )}
          </PortalFrame>
        )}
      </RequireAuth>
    </main>
  );
}
