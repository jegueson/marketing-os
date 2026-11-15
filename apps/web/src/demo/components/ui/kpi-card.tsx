"use client";

import { motion } from "motion/react";
import { formatValue } from "@/demo/lib/format";
import { kpiDelta, type Kpi } from "@/demo/data/cockpit";
import { Sparkline } from "../charts";
import { useChartColors } from "../theme";
import { AnimatedNumber } from "./animated-number";
import { Delta } from "./badges";
import { revealItem } from "./reveal";

/** KPI card per PRD §23: value, previous, target, delta, source, freshness. */
export function KpiCard({ kpi }: { kpi: Kpi }) {
  const c = useChartColors();
  const change = kpiDelta(kpi);
  const good = change >= 0 === kpi.goodWhenUp;
  const progress = kpi.goodWhenUp ? kpi.value / kpi.target : kpi.target / kpi.value;
  const pct = Math.min(100, Math.round(progress * 100));

  return (
    <motion.article
      variants={revealItem}
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 400, damping: 26 }}
      className="glass group relative overflow-hidden rounded-2xl p-5"
    >
      <div aria-hidden="true" className="absolute -top-16 -right-16 size-36 rounded-full bg-primary/0 blur-2xl transition-colors duration-500 group-hover:bg-primary/25" />
      <div className="relative flex items-start justify-between gap-2">
        <h3 className="text-sm text-muted">{kpi.label}</h3>
        <Delta value={change} goodWhenUp={kpi.goodWhenUp} />
      </div>
      <p className="relative mt-2 text-3xl font-semibold tracking-tight">
        <AnimatedNumber value={kpi.value} format={(v) => formatValue(kpi.kind === "number" ? Math.round(v) : v, kpi.kind)} />
      </p>
      <p className="relative mt-0.5 text-xs text-muted">
        vs {formatValue(kpi.previous, kpi.kind)} prior · target {formatValue(kpi.target, kpi.kind)}
      </p>
      <div className="relative mt-3">
        <Sparkline data={kpi.spark} color={good ? c.primary : c.danger} />
      </div>
      <div className="relative mt-3">
        <div className="h-1 overflow-hidden rounded-full bg-muted/15" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${kpi.label} versus target`}>
          <motion.div
            className={`h-full rounded-full ${pct >= 100 ? "bg-success" : "bg-accent"}`}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
          />
        </div>
        <p className="mt-2 flex justify-between text-[11px] text-muted">
          <span>{kpi.source}</span>
          <span>fresh · {kpi.freshness}</span>
        </p>
      </div>
    </motion.article>
  );
}
