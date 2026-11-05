"use client";

import { Button } from "@marketing-os/ui";
import { RequireAuth } from "@/components/auth";
import { PortalFrame } from "@/components/workspace";

export default function PortalHomePage() {
  return (
    <main>
      <h1>Customer portal</h1>
      <RequireAuth>
        {(auth) => (
          <>
            <p>Signed in as {auth.me.email}</p>
            <PortalFrame me={auth.me}>
              {(ws) => (
                <p>
                  {ws.tenantName} · {ws.workspaceName} · your role: {ws.role}
                </p>
              )}
            </PortalFrame>
            <Button onClick={() => void auth.signOut()}>Sign out</Button>
          </>
        )}
      </RequireAuth>
    </main>
  );
}
