"use client";

import { Grid3x3, Mail, ShieldAlert } from "lucide-react";
import { Badge } from "@/demo/components/ui/badges";
import { Card } from "@/demo/components/ui/card";
import { KpiCard } from "@/demo/components/ui/kpi-card";
import { PageHeader } from "@/demo/components/ui/page-header";
import { Stagger } from "@/demo/components/ui/reveal";
import { CohortHeatmap, InlineBar } from "@/demo/components/viz";
import { CHURN_RISK, COHORTS, LIFECYCLE, RETENTION_KPIS } from "@/demo/data/modules";
import { formatNumber } from "@/demo/lib/format";

export default function RetentionPage() {
  return (
    <>
      <PageHeader title="Retention" subtitle="Lifecycle programs, cohort retention and churn risk from CRM and product data." />
      <Stagger className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {RETENTION_KPIS.map((kpi) => (
            <KpiCard key={kpi.id} kpi={kpi} />
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-5">
          <Card className="xl:col-span-3" title="Logo retention by signup cohort" icon={<Grid3x3 />}>
            <CohortHeatmap rows={COHORTS} />
            <p className="mt-3 text-xs text-muted">Recent cohorts retain 3 to 4 points better at month 2, after the new onboarding sequence.</p>
          </Card>
          <Card className="xl:col-span-2" title="Churn risk segments" icon={<ShieldAlert />}>
            <ul className="flex flex-col gap-4">
              {CHURN_RISK.map((s) => (
                <li key={s.segment}>
                  <p className="flex items-center justify-between text-sm">
                    <span className="font-medium">{s.segment}</span>
                    <span className="text-xs text-muted">{formatNumber(s.accounts)} accounts</span>
                  </p>
                  <div className="mt-1.5 flex items-center gap-3">
                    <InlineBar value={s.risk} max={100} tone={s.risk > 50 ? "danger" : s.risk > 30 ? "warning" : "primary"} />
                    <span className="w-10 text-right text-xs font-semibold tabular">{s.risk}%</span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card title="Lifecycle programs · last 30 days" icon={<Mail />} action={<Badge tone="primary">Customer.io</Badge>} bodyClassName="px-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="px-5 py-2.5 font-medium">Program</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Sent</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Open rate</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Click rate</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {LIFECYCLE.map((p) => (
                  <tr key={p.program} className="border-b border-border/60 last:border-0 hover:bg-surface-2/40">
                    <td className="px-5 py-3 font-medium">{p.program}</td>
                    <td className="px-3 py-3 text-muted tabular">{formatNumber(p.sent)}</td>
                    <td className="w-36 px-3 py-3 tabular">{p.open}%<InlineBar value={p.open} max={70} /></td>
                    <td className="px-3 py-3 tabular">{p.click}%</td>
                    <td className="px-5 py-3 font-semibold text-accent tabular">{p.conversion}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Stagger>
    </>
  );
}
