"use client";

import { Calendar, Menu, Moon, Presentation, Search, Sun } from "lucide-react";
import { COMPANY } from "@/demo/data/company";
import { useTour } from "@/demo/tour/tour-provider";
import { StatusDot } from "../ui/badges";
import { useTheme } from "../theme";

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { theme, toggle } = useTheme();
  const tour = useTour();

  return (
    <header className="glass sticky top-0 z-30 flex h-16 items-center gap-3 border-x-0 border-t-0 px-4 lg:px-6">
      <button type="button" onClick={onMenu} aria-label="Open navigation" className="focus-ring rounded-lg p-2 text-muted hover:text-fg lg:hidden">
        <Menu aria-hidden="true" className="size-5" />
      </button>

      <div className="hidden items-center gap-2 md:flex">
        <span className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
          <Calendar aria-hidden="true" className="size-4 text-muted" />
          {COMPANY.period}
        </span>
        <span className="inline-flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-medium text-success">
          <StatusDot tone="success" pulse />
          {COMPANY.freshness}
        </span>
      </div>

      <label className="relative ml-auto hidden max-w-xs flex-1 sm:block">
        <span className="sr-only">Search the demo</span>
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          placeholder="Search metrics, campaigns, agents"
          className="focus-ring w-full rounded-lg border border-border bg-surface-2/50 py-2 pr-12 pl-9 text-sm placeholder:text-muted/70"
        />
        <kbd className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-border px-1.5 text-[10px] text-muted">⌘K</kbd>
      </label>

      <button
        type="button"
        onClick={tour.start}
        className="focus-ring inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white shadow-[0_6px_20px_-6px_rgb(37_99_235/0.8)] transition hover:bg-primary-strong max-sm:ml-auto"
      >
        <Presentation aria-hidden="true" className="size-4" />
        <span className="hidden sm:inline">Investor tour</span>
      </button>

      <button
        type="button"
        onClick={toggle}
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        className="focus-ring grid size-9 cursor-pointer place-items-center rounded-lg border border-border text-muted transition hover:text-fg"
      >
        {theme === "dark" ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
      </button>

      <span
        title={`${COMPANY.user.name} · ${COMPANY.user.role}`}
        className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-slate-500 to-primary text-xs font-semibold text-white"
      >
        {COMPANY.user.initials}
      </span>
    </header>
  );
}
