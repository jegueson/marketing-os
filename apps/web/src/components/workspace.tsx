"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { EmptyState } from "@marketing-os/ui";
import { AppShell } from "@/components/app-shell";
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
  if (me.memberships.length < 2) {
    return <p className="app-lede">Workspace: {current.tenantName}</p>;
  }
  return (
    <label className="mos-input">
      <span>Workspace</span>
      <select
        className="app-select"
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
    <nav aria-label="Portal" className="app-nav">
      {links.map((link) => (
        <Link key={link.href} href={link.href}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

/** Portal page frame: branded shell, workspace switcher, nav. */
export function PortalFrame({
  me,
  api,
  title = "Customer portal",
  onSignOut,
  children,
}: {
  me: Me;
  api?: ApiClient;
  title?: string;
  onSignOut?: () => void;
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

  const links = portalLinks(workspace.workspaceId, workspace.role, flags);
  const q = `?ws=${encodeURIComponent(workspace.workspaceId)}`;

  return (
    <AppShell
      brandHref={`/portal${q}`}
      brandLabel="Marketing OS"
      title={title}
      email={me.email}
      meta={
        <>
          <span>
            {workspace.tenantName} · {workspace.workspaceName}
          </span>
          <span>your role: {workspace.role}</span>
        </>
      }
      links={links}
      sidebarExtra={<WorkspaceSwitcher me={me} current={workspace} />}
      {...(onSignOut ? { onSignOut } : {})}
    >
      {children(workspace)}
    </AppShell>
  );
}
