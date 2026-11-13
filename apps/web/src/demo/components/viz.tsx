"use client";

import { motion } from "motion/react";
import { formatNumber } from "@/demo/lib/format";

/** Horizontal funnel with stage-to-stage conversion. Bars grow on mount. */
export function Funnel({ stages }: { stages: readonly { stage: string; value: number }[] }) {
  const max = stages[0]?.value ?? 1;
  return (
    <ol className="flex flex-col gap-2.5">
      {stages.map((s, i) => {
        // Log scale keeps the narrow bottom of the funnel visible.
        const width = Math.max(6, (Math.log10(s.value) / Math.log10(max)) * 100);
        const prev = stages[i - 1]?.value;
        const rate = prev ? (s.value / prev) * 100 : null;
        return (
          <li key={s.stage} className="grid grid-cols-[110px_1fr_64px] items-center gap-3 text-xs">
            <span className="text-muted">{s.stage}</span>
            <span className="relative h-7 overflow-hidden rounded-md bg-muted/10">
              <motion.span
                className="absolute inset-y-0 left-0 flex items-center rounded-md bg-gradient-to-r from-primary to-accent px-2 font-semibold text-white tabular"
                initial={{ width: 0 }}
                animate={{ width: `${width}%` }}
                transition={{ duration: 0.9, delay: 0.1 + i * 0.09, ease: [0.16, 1, 0.3, 1] }}
              >
                {formatNumber(s.value)}
              </motion.span>
            </span>
            <span className="text-right text-muted tabular">{rate ? `${rate.toFixed(rate < 1 ? 1 : 0)}%` : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Cohort retention heatmap. Cell opacity encodes the value; the number is always printed too. */
export function CohortHeatmap({ rows }: { rows: readonly { cohort: string; values: readonly number[] }[] }) {
  const months = Math.max(...rows.map((r) => r.values.length));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-xs">
        <thead>
          <tr className="text-muted">
            <th scope="col" className="text-left font-medium">Cohort</th>
            {Array.from({ length: months }, (_, m) => (
              <th key={m} scope="col" className="font-medium">M{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={row.cohort}>
              <th scope="row" className="pr-2 text-left font-medium text-muted">{row.cohort}</th>
              {Array.from({ length: months }, (_, m) => {
                const v = row.values[m];
                if (v === undefined) return <td key={m} />;
                const alpha = 0.15 + ((v - 75) / 25) * 0.85;
                return (
                  <motion.td
                    key={m}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.05 * (r + m), type: "spring", stiffness: 300, damping: 24 }}
                    className="h-9 rounded-md text-center font-semibold tabular"
                    style={{ background: `rgb(59 130 246 / ${Math.max(0.12, Math.min(1, alpha))})`, ...(alpha > 0.55 ? { color: "#fff" } : {}) }}
                  >
                    {v}%
                  </motion.td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Radial score gauge (0-100) that sweeps in. */
export function ScoreRing({ score, label }: { score: number; label: string }) {
  const r = 52;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto size-40" role="img" aria-label={`${label}: ${score} out of 100`}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/15" />
        <motion.circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="url(#score-grad)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - score / 100) }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
        />
        <defs>
          <linearGradient id="score-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tabular">{score}</span>
        <span className="text-[11px] text-muted">{label}</span>
      </div>
    </div>
  );
}

/** Thin inline bar for table cells. */
export function InlineBar({ value, max, tone = "primary" }: { value: number; max: number; tone?: "primary" | "danger" | "warning" }) {
  const color = { primary: "bg-accent", danger: "bg-danger", warning: "bg-warning" }[tone];
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted/15">
      <motion.span className={`block h-full rounded-full ${color}`} initial={{ width: 0 }} animate={{ width: `${Math.min(100, (value / max) * 100)}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
    </span>
  );
}
