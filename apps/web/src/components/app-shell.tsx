"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@marketing-os/ui";

export type AppNavLink = { href: string; label: string };

function pathMatches(pathname: string, href: string): boolean {
  const path = href.split("?")[0] ?? href;
  if (path === "/portal" || path === "/console") return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

function NavLinks({ links, className }: { links: AppNavLink[]; className: string }) {
  const pathname = usePathname();
  return (
    <nav className={className} aria-label="Primary">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={pathMatches(pathname, link.href) ? "page" : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

/** Shared product chrome: carbon field, sage glass sidebar, yuzu active marks. */
export function AppShell({
  brandHref,
  brandLabel,
  title,
  email,
  meta,
  links,
  sidebarExtra,
  onSignOut,
  children,
}: {
  brandHref: string;
  brandLabel: string;
  title: string;
  email?: string;
  meta?: ReactNode;
  links: AppNavLink[];
  sidebarExtra?: ReactNode;
  onSignOut?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <a className="mos-skip" href="#main-content">
        Skip to main content
      </a>
      <div className="mos-ambient" aria-hidden="true" />
      <aside className="app-sidebar glass" aria-label="Workspace">
        <Link href={brandHref} className="app-brand">
          <span className="app-brand-mark" aria-hidden="true" />
          {brandLabel}
        </Link>
        <NavLinks links={links} className="app-nav" />
        {sidebarExtra}
        <div className="app-sidebar-foot">
          {email ? <span>{email}</span> : null}
          {onSignOut ? (
            <Button type="button" variant="ghost" onClick={onSignOut}>
              Sign out
            </Button>
          ) : null}
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div>
            <h1>{title}</h1>
            {meta ? <div className="app-topbar-meta">{meta}</div> : null}
          </div>
          {onSignOut ? (
            <Button type="button" variant="ghost" onClick={onSignOut} className="app-topbar-signout">
              Sign out
            </Button>
          ) : null}
        </header>
        <NavLinks links={links} className="app-mobile-nav" />
        <main id="main-content" className="app-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
