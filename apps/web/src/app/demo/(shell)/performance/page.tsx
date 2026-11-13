"use client";

import { motion } from "motion/react";
import { ArrowUpDown, BarChart3, Filter, Megaphone } from "lucide-react";
import { useMemo, useState } from "react";
import { BarLine } from "@/demo/components/charts";
import { Badge, type Tone } from "@/demo/components/ui/badges";
import { Card } from "@/demo/components/ui/card";
import { KpiCard } from "@/demo/components/ui/kpi-card";
import { PageHeader } from "@/demo/components/ui/page-header";
import { Stagger } from "@/demo/components/ui/reveal";
import { Funnel, InlineBar } from "@/demo/components/viz";
import { CAMPAIGNS, FUNNEL, PERFORMANCE_KPIS, SPEND_VS_ROAS, type Campaign } from "@/demo/data/modules";
import { formatCompactEur, formatEur } from "@/demo/lib/format";

type SortKey = "spend" | "sql" | "cpsql" | "roas";

const STATUS_TONE: Record<Campaign["status"], Tone> = {
  Scaling: "success",
  Healthy: "primary",
  Watch: "warning",
  Underperforming: "danger",
};

const COLUMNS: readonly { key: SortKey; label: string }[] = [
  { key: "spend", label: "Spend" },
  { key: "sql", label: "SQLs" },
  { key: "cpsql", label: "Cost / SQL" },
  { key: "roas", label: "ROAS" },
];

export default function PerformancePage() {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "spend", desc: true });
  const rows = useMemo(
    () => [...CAMPAIGNS].sort((a, b) => (sort.desc ? b[sort.key] - a[sort.key] : a[sort.key] - b[sort.key])),
    [sort],
  );
  const maxSpend = Math.max(...CAMPAIGNS.map((c) => c.spend));

  function toggle(key: SortKey) {
    setSort((current) => ({ key, desc: current.key === key ? !current.desc : true }));
  }

  return (
    <>
      <PageHeader title="Performance" subtitle="Paid channels, spend efficiency and the full-funnel view, on one metric layer." />
      <Stagger className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PERFORMANCE_KPIS.map((kpi) => (
            <KpiCard key={kpi.id} kpi={kpi} />
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-5">
          <Card className="xl:col-span-3" title="Spend vs pipeline ROAS by channel" icon={<BarChart3 />}>
            <BarLine data={SPEND_VS_ROAS} barName="Spend" lineName="ROAS" formatBar={formatCompactEur} formatLine={(v) => `${v.toFixed(1)}x`} />
          </Card>
          <Card tour="performance-funnel" className="xl:col-span-2" title="Full funnel · last 30 days" icon={<Filter />}>
            <Funnel stages={FUNNEL} />
            <p className="mt-4 text-xs text-muted">Stage conversion shown on the right. Visit-to-lead is 4.5%, best in 6 months.</p>
          </Card>
        </div>

        <Card title="Campaigns" icon={<Megaphone />} action={<Badge tone="danger">2 below guardrail</Badge>} bodyClassName="px-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="px-5 py-2.5 font-medium">Campaign</th>
                  {COLUMNS.map((col) => (
                    <th key={col.key} scope="col" className="px-3 py-2.5 font-medium" aria-sort={sort.key === col.key ? (sort.desc ? "descending" : "ascending") : "none"}>
                      <button type="button" onClick={() => toggle(col.key)} className={`focus-ring inline-flex cursor-pointer items-center gap-1 rounded hover:text-fg ${sort.key === col.key ? "text-fg" : ""}`}>
                        {col.label} <ArrowUpDown aria-hidden="true" className="size-3" />
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <motion.tr key={c.name} layout transition={{ type: "spring", stiffness: 500, damping: 40 }} className="border-b border-border/60 last:border-0 hover:bg-surface-2/40">
                    <td className="px-5 py-3">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted">{c.channel}</p>
                    </td>
                    <td className="w-40 px-3 py-3 tabular">
                      {formatEur(c.spend)}
                      <InlineBar value={c.spend} max={maxSpend} />
                    </td>
                    <td className="px-3 py-3 tabular">{c.sql}</td>
                    <td className={`px-3 py-3 tabular ${c.cpsql > 140 ? "text-danger" : ""}`}>{formatEur(c.cpsql)}</td>
                    <td className="px-3 py-3 tabular">{c.roas.toFixed(1)}x</td>
                    <td className="px-5 py-3"><Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge></td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Stagger>
    </>
  );
}
