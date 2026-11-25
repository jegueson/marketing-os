"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AppShell, type AppNavLink } from "@/components/app-shell";
import type { ReadyAuth } from "@/components/auth";

/** Specialist console chrome with leads/customers nav when flags allow. */
export function ConsoleFrame({
  auth,
  title,
  children,
}: {
  auth: ReadyAuth;
  title: string;
  children: ReactNode;
}) {
  const [links, setLinks] = useState<AppNavLink[]>([{ href: "/console/customers", label: "Customers" }]);

  useEffect(() => {
    let cancelled = false;
    void auth.api<Record<string, boolean>>("/api/v1/me/features").then((res) => {
      if (cancelled || !res.success || !res.data) return;
      const next: AppNavLink[] = [{ href: "/console", label: "Home" }];
      if (res.data["nav.leads_admin"] === true) {
        next.push({ href: "/console/leads", label: "Leads" });
      }
      next.push({ href: "/console/customers", label: "Customers" });
      setLinks(next);
    });
    return () => {
      cancelled = true;
    };
  }, [auth]);

  return (
    <AppShell
      brandHref="/console"
      brandLabel="Marketing OS"
      title={title}
      email={auth.me.email}
      meta={<span>Staff · {auth.me.staffRole}</span>}
      links={links}
      onSignOut={() => void auth.signOut()}
    >
      {children}
    </AppShell>
  );
}
