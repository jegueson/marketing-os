"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { EmptyState } from "@marketing-os/ui";
import { pickWorkspace, type Me, type Membership } from "@/lib/workspace";

/** Current workspace from `?ws=`, limited to the caller's memberships. */
export function useWorkspace(me: Me): Membership | null {
  const params = useSearchParams();
  return pickWorkspace(me.memberships, params.get("ws"));
}

export function WorkspaceSwitcher({ me, current }: { me: Me; current: Membership }) {
  const router = useRouter();
  const pathname = usePathname();
  if (me.memberships.length < 2) return <p>Workspace: {current.tenantName}</p>;
  return (
    <label>
      Workspace{" "}
      <select
        value={current.workspaceId}
        onChange={(e) => router.push(`${pathname}?ws=${encodeURIComponent(e.target.value)}`)}
      >
        {me.memberships.map((m) => (
          <option key={m.workspaceId} value={m.workspaceId}>
            {m.tenantName} / {m.workspaceName}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PortalNav({ workspaceId }: { workspaceId: string }) {
  const q = `?ws=${encodeURIComponent(workspaceId)}`;
  return (
    <nav aria-label="Portal">
      <Link href={`/portal${q}`}>Home</Link> |{" "}
      <Link href={`/portal/onboarding${q}`}>Onboarding</Link> |{" "}
      <Link href={`/portal/integrations${q}`}>Integrations</Link> |{" "}
      <Link href={`/portal/cockpit${q}`}>Cockpit</Link>
    </nav>
  );
}

/** Portal page frame: workspace switcher, nav, and an empty state for users with no workspace. */
export function PortalFrame({
  me,
  children,
}: {
  me: Me;
  children: (workspace: Membership) => ReactNode;
}) {
  const workspace = useWorkspace(me);
  if (!workspace) {
    return (
      <EmptyState
        title="No workspace yet"
        body="Open the invitation link from your email to join your company workspace."
      />
    );
  }
  return (
    <>
      <WorkspaceSwitcher me={me} current={workspace} />
      <PortalNav workspaceId={workspace.workspaceId} />
      {children(workspace)}
    </>
  );
}
