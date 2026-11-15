import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { formatPercent } from "@/demo/lib/format";

export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "violet";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted/12 text-muted",
  primary: "bg-primary/14 text-accent",
  success: "bg-success/14 text-success",
  warning: "bg-warning/14 text-warning",
  danger: "bg-danger/14 text-danger",
  violet: "bg-violet/14 text-violet",
};

export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

/**
 * Change versus previous period. `goodWhenUp=false` is for cost metrics
 * (CAC, CPA) where a decrease is the good outcome.
 */
export function Delta({ value, goodWhenUp = true }: { value: number; goodWhenUp?: boolean }) {
  const up = value >= 0;
  const good = up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular ${good ? "text-success" : "text-danger"}`}>
      <Icon aria-hidden="true" className="size-3.5" />
      {formatPercent(value, { signed: true })}
      <span className="sr-only">{good ? "(improvement)" : "(decline)"}</span>
    </span>
  );
}

export function StatusDot({ tone, pulse = false }: { tone: Tone; pulse?: boolean }) {
  const color = {
    neutral: "bg-muted",
    primary: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    violet: "bg-violet",
  }[tone];
  return (
    <span aria-hidden="true" className="relative inline-flex size-2">
      {pulse ? <span className={`absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:animate-none ${color}`} /> : null}
      <span className={`relative inline-flex size-2 rounded-full ${color}`} />
    </span>
  );
}
