"use client";

import { ArrowDown, ArrowUp, FileText, Gauge, KeyRound, LineChart, Minus } from "lucide-react";
import { TrendArea } from "@/demo/components/charts";
import { Badge, StatusDot } from "@/demo/components/ui/badges";
import { DemoButton } from "@/demo/components/ui/buttons";
import { Card } from "@/demo/components/ui/card";
import { KpiCard } from "@/demo/components/ui/kpi-card";
import { PageHeader } from "@/demo/components/ui/page-header";
import { Stagger } from "@/demo/components/ui/reveal";
import { useToast } from "@/demo/components/toast";
import { ScoreRing } from "@/demo/components/viz";
import { CONTENT_OPPORTUNITIES, KEYWORDS, ORGANIC_KPIS, ORGANIC_TRAFFIC, TECH_HEALTH } from "@/demo/data/modules";
import { formatNumber } from "@/demo/lib/format";

function Movement({ change }: { change: number }) {
  if (change === 0) return <span className="inline-flex items-center text-muted"><Minus aria-hidden="true" className="size-3.5" /><span className="sr-only">no change</span></span>;
  const up = change > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold tabular ${up ? "text-success" : "text-danger"}`}>
      <Icon aria-hidden="true" className="size-3.5" />
      {Math.abs(change)}
      <span className="sr-only">{up ? "positions gained" : "positions lost"}</span>
    </span>
  );
}

export default function OrganicPage() {
  const notify = useToast();
  return (
    <>
      <PageHeader title="Organic" subtitle="Search visibility, content performance and technical health." />
      <Stagger className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {ORGANIC_KPIS.map((kpi) => (
            <KpiCard key={kpi.id} kpi={kpi} />
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2" title="Organic sessions per day · 90 days vs prior year" icon={<LineChart />}>
            <TrendArea data={ORGANIC_TRAFFIC} format={formatNumber} height={280} />
          </Card>
          <Card title="Technical health" icon={<Gauge />}>
            <ScoreRing score={TECH_HEALTH.score} label="Site health" />
            <ul className="mt-4 flex flex-col gap-2 text-sm">
              {TECH_HEALTH.issues.map((issue) => (
                <li key={issue.label} className="flex items-center gap-2">
                  <StatusDot tone={issue.tone} />
                  <span className="flex-1 text-muted">{issue.label}</span>
                  <span className="font-semibold tabular">{issue.count}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2" title="Tracked keywords" icon={<KeyRound />} bodyClassName="px-0 pb-2">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-border">
                    <th scope="col" className="px-5 py-2.5 font-medium">Keyword</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Position</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">7-day move</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Volume</th>
                    <th scope="col" className="px-5 py-2.5 font-medium">Intent</th>
                  </tr>
                </thead>
                <tbody>
                  {KEYWORDS.map((k) => (
                    <tr key={k.keyword} className="border-b border-border/60 last:border-0 hover:bg-surface-2/40">
                      <td className="px-5 py-3 font-medium">{k.keyword}</td>
                      <td className="px-3 py-3 tabular">#{k.position}</td>
                      <td className="px-3 py-3"><Movement change={k.change} /></td>
                      <td className="px-3 py-3 text-muted tabular">{formatNumber(k.volume)}</td>
                      <td className="px-5 py-3"><Badge tone={k.intent === "Commercial" ? "primary" : "neutral"}>{k.intent}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Content opportunities" icon={<FileText />}>
            <ul className="flex flex-col gap-3">
              {CONTENT_OPPORTUNITIES.map((o) => (
                <li key={o.title} className="rounded-xl border border-border bg-surface-2/40 p-3.5">
                  <p className="text-sm font-medium">{o.title}</p>
                  <p className="mt-1 flex items-center justify-between text-xs text-muted">
                    <span className="text-accent">{o.impact}</span>
                    <span>{o.difficulty} difficulty</span>
                  </p>
                  <DemoButton
                    className="mt-3 w-full"
                    onClick={() => notify({ tone: "info", title: "Brief requested", body: `SEO Strategist is drafting "${o.title}".` })}
                  >
                    Generate brief
                  </DemoButton>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Stagger>
    </>
  );
}
