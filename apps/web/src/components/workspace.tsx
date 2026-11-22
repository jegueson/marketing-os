"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { EmptyState } from "@marketing-os/ui";
import type { ApiClient } from "@/lib/api";
import { pickWorkspace, portalLinks, type Me, type Membership } from "@/lib/workspace";

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

export function PortalNav({
  workspaceId,
  role,
  flags = {},
}: {
  workspaceId: string;
  role: string;
  flags?: Readonly<Record<string, boolean>>;
}) {
  const links = portalLinks(workspaceId, role, flags);
  return (
    <nav aria-label="Portal">
      {links.map((link, index) => (
        <span key={link.href}>
          {index > 0 ? " | " : null}
          <Link href={link.href}>{link.label}</Link>
        </span>
      ))}
    </nav>
  );
}

/** Portal page frame: workspace switcher, nav, and an empty state for users with no workspace. */
export function PortalFrame({
  me,
  api,
  children,
}: {
  me: Me;
  api?: ApiClient;
  children: (workspace: Membership) => ReactNode;
}) {
  const workspace = useWorkspace(me);
  const workspaceId = workspace?.workspaceId ?? null;
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!api || !workspaceId) return;
    let cancelled = false;
    void api<Record<string, boolean>>(`/api/v1/workspaces/${workspaceId}/features`).then((res) => {
      if (!cancelled && res.success && res.data) setFlags(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [api, workspaceId]);
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
      <PortalNav workspaceId={workspace.workspaceId} role={workspace.role} flags={flags} />
      {children(workspace)}
    </>
  );
}
