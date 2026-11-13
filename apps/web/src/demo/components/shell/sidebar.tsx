"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { COMPANY } from "@/demo/data/company";
import { NAV } from "./nav";
import { Logo } from "./logo";

export function Sidebar({ onNavigate = () => undefined }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Demo navigation" className="flex h-full flex-col gap-6 px-3 py-5">
      <Link href="/demo" className="focus-ring flex items-center gap-2.5 rounded-lg px-2" onClick={onNavigate}>
        <Logo />
        <span className="leading-tight">
          <span className="block text-sm font-semibold">Marketing OS</span>
          <span className="block text-[11px] text-muted">Investor demo</span>
        </span>
      </Link>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto">
        {NAV.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-muted/80 uppercase">{group.label}</p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`focus-ring group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${active ? "text-fg" : "text-muted hover:text-fg"}`}
                    >
                      {active ? (
                        <motion.span
                          layoutId="nav-active"
                          className="absolute inset-0 rounded-lg border border-primary/30 bg-primary/12"
                          transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        />
                      ) : null}
                      <Icon aria-hidden="true" className={`relative size-4 transition-transform group-hover:scale-110 ${active ? "text-accent" : ""}`} />
                      <span className="relative flex-1">{item.label}</span>
                      {item.badge ? (
                        <span className="relative rounded-full bg-primary/18 px-1.5 text-[10px] font-semibold text-accent">{item.badge}</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="glass flex items-center gap-3 rounded-xl p-3">
        <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-slate-600 text-xs font-bold text-white">AC</span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-medium">{COMPANY.name}</span>
          <span className="block truncate text-[11px] text-muted">{COMPANY.team}</span>
        </span>
      </div>
    </nav>
  );
}
