"use client";

import { Eye, Megaphone, MessageSquareQuote, Radar, Sparkles } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartColors } from "@/demo/components/theme";
import { Badge } from "@/demo/components/ui/badges";
import { Card } from "@/demo/components/ui/card";
import { PageHeader } from "@/demo/components/ui/page-header";
import { Stagger } from "@/demo/components/ui/reveal";
import { InlineBar } from "@/demo/components/viz";
import {
  AD_SNAPSHOTS,
  COMPETITORS,
  REVIEW_THEMES,
  SOV_SERIES,
  WHAT_CHANGED,
} from "@/demo/data/intelligence";

function SovChart() {
  const c = useChartColors();
  return (
    <div className="h-56" role="img" aria-label="Share of voice over four weeks for Acme, Flowly, Orbit and Pulseboard">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={[...SOV_SERIES]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: c.axis }} />
          <YAxis tick={{ fontSize: 11, fill: c.axis }} unit="%" width={36} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="acme" name="Acme" stroke={c.primary} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="flowly" name="Flowly" stroke={c.accent} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="orbit" name="Orbit" stroke={c.violet} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="pulse" name="Pulseboard" stroke={c.warning} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function IntelligencePage() {
  return (
    <>
      <PageHeader
        title="Market intelligence"
        subtitle="Competitor profiles, ad libraries, SEO visibility and review themes — official APIs and licensed data only."
      />
      <Stagger className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-tour="intelligence-competitors">
          {COMPETITORS.map((co) => (
            <Card key={co.id} bodyClassName="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{co.name}</p>
                  <p className="text-xs text-muted">{co.category} · {co.domain}</p>
                </div>
                <Badge tone={co.category === "You" ? "primary" : "neutral"}>{co.change}</Badge>
              </div>
              <p className="text-xs text-muted">Share of voice</p>
              <div className="flex items-center gap-3">
                <InlineBar value={co.shareOfVoice} max={40} />
                <span className="w-10 text-right text-sm font-semibold tabular">{co.shareOfVoice}%</span>
              </div>
              <p className="text-xs text-muted">
                Ad index {co.adSpendIndex} · Sentiment {co.sentiment}
              </p>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-5">
          <Card className="xl:col-span-3" title="Share of voice · 4 weeks" icon={<Eye />}>
            <SovChart />
          </Card>
          <Card className="xl:col-span-2" title="Review themes vs peers" icon={<MessageSquareQuote />}>
            <ul className="flex flex-col gap-3">
              {REVIEW_THEMES.map((t) => (
                <li key={t.theme}>
                  <p className="flex justify-between text-sm">
                    <span className="font-medium">{t.theme}</span>
                    <span className="text-xs text-muted">You {t.you} · Peers {t.competitorAvg}</span>
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <InlineBar value={t.you} max={100} tone="primary" />
                    <InlineBar value={t.competitorAvg} max={100} tone="warning" />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="What changed" icon={<Radar />} bodyClassName="space-y-3">
            {WHAT_CHANGED.map((e) => (
              <div key={e.id} className="rounded-xl border border-border bg-surface-2/40 p-3">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone="violet">{e.kind}</Badge>
                  <span className="font-medium">{e.competitor}</span>
                  <span className="text-xs text-muted">{e.when}</span>
                </p>
                <p className="mt-1 text-sm">{e.title}</p>
                <p className="text-xs text-muted">{e.detail}</p>
              </div>
            ))}
          </Card>

          <Card title="Competitor ads" icon={<Megaphone />} bodyClassName="grid gap-3 sm:grid-cols-2">
            {AD_SNAPSHOTS.map((ad) => (
              <div key={ad.id} className="rounded-xl border border-border bg-surface-2/40 p-3">
                <p className="flex items-center gap-2 text-xs text-muted">
                  <Sparkles aria-hidden="true" className="size-3.5 text-accent" />
                  {ad.competitor} · {ad.platform}
                </p>
                <p className="mt-2 text-sm font-medium text-pretty">“{ad.hook}”</p>
                <p className="mt-2 text-xs text-muted">
                  Running {ad.runningDays}d · Reach {ad.estimatedReach}
                </p>
              </div>
            ))}
          </Card>
        </div>
      </Stagger>
    </>
  );
}
