"use client";

import { RequireAuth } from "@/components/auth";
import { PortalFrame } from "@/components/workspace";

export default function PortalHomePage() {
  return (
    <RequireAuth>
      {(auth) => (
        <PortalFrame
          me={auth.me}
          api={auth.api}
          title="Customer portal"
          onSignOut={() => void auth.signOut()}
        >
          {(ws) => (
            <section className="app-panel">
              <h2>Welcome</h2>
              <p className="app-lede">
                {ws.tenantName} · {ws.workspaceName} · your role: {ws.role}
              </p>
              <p className="app-lede">
                Use the sidebar to finish onboarding, connect sources, open the cockpit, or ask
                Marketing.
              </p>
            </section>
          )}
        </PortalFrame>
      )}
    </RequireAuth>
  );
}
