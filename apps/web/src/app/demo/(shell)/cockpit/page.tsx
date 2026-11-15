"use client";

import { AnimatePresence, motion } from "motion/react";
import { Activity, Bot, Check, ChevronRight, Lightbulb, PieChart, Radar, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Donut, TrendArea } from "@/demo/components/charts";
import { Badge, StatusDot } from "@/demo/components/ui/badges";
import { DemoButton, Segmented } from "@/demo/components/ui/buttons";
import { Card } from "@/demo/components/ui/card";
import { KpiCard } from "@/demo/components/ui/kpi-card";
import { PageHeader } from "@/demo/components/ui/page-header";
import { Stagger } from "@/demo/components/ui/reveal";
import { useChartColors } from "@/demo/components/theme";
import { useToast } from "@/demo/components/toast";
import { AGENT_ACTIVITY, ATTENTION, CHANNEL_MIX, KPIS, PIPELINE_PULSE, RECOMMENDATIONS } from "@/demo/data/cockpit";
import { COMPANY } from "@/demo/data/company";
import { formatCompactEur } from "@/demo/lib/format";

const PULSE_RANGES = [
  { id: "30", label: "30d" },
  { id: "14", label: "14d" },
  { id: "7", label: "7d" },
] as const;

type Range = (typeof PULSE_RANGES)[number]["id"];

export default function CockpitPage() {
  const [range, setRange] = useState<Range>("30");
  const [approved, setApproved] = useState<ReadonlySet<string>>(new Set());
  const notify = useToast();
  const colors = useChartColors();
  const pulse = PIPELINE_PULSE.slice(-Number(range));
  const mixTotal = CHANNEL_MIX.reduce((sum, slice) => sum + slice.value, 0);

  function approve(id: string, title: string) {
    setApproved((current) => new Set([...current, id]));
    notify({ tone: "success", title: "Recommendation approved", body: `${title}. Queued for the owner agent.` });
  }

  return (
    <>
      <PageHeader
        title={`Good morning, ${COMPANY.user.name.split(" ")[0]}`}
        subtitle={`${COMPANY.name} · ${COMPANY.period} · pipeline is ahead of target`}
        actions={<DemoButton icon={<Sparkles />}>Generate CMO brief</DemoButton>}
      />

      <Stagger className="grid gap-4">
        <div data-tour="cockpit-kpis" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {KPIS.map((kpi) => (
            <KpiCard key={kpi.id} kpi={kpi} />
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card
            tour="cockpit-pulse"
            className="xl:col-span-2"
            title="Performance pulse · marketing-sourced pipeline per day"
            icon={<Activity />}
            action={<Segmented label="Pulse range" options={PULSE_RANGES} value={range} onChange={setRange} />}
          >
            <TrendArea data={pulse} format={formatCompactEur} />
            <div className="mt-2 flex gap-5 text-xs text-muted">
              <span className="flex items-center gap-2"><span className="h-0.5 w-4 rounded bg-primary" /> This period</span>
              <span className="flex items-center gap-2"><span className="h-0.5 w-4 rounded border-t border-dashed border-muted" /> Previous period</span>
            </div>
          </Card>

          <Card tour="cockpit-attention" title="Attention queue" icon={<Radar />} action={<Badge tone="danger">{ATTENTION.length} open</Badge>}>
            <ul className="flex flex-col gap-2">
              {ATTENTION.map((item, i) => (
                <motion.li
                  key={item.id}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.08 }}
                >
                  <button type="button" className="focus-ring group flex w-full cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface-2/40 p-3 text-left transition hover:border-accent/40 hover:bg-surface-2/80">
                    <span className="mt-1.5"><StatusDot tone={item.tone} pulse={i === 0} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">{item.kind}</span>
                        <span className="text-[11px] text-muted">{item.age}</span>
                      </span>
                      <span className="mt-0.5 block text-sm font-medium">{item.title}</span>
                      <span className="block text-xs text-muted">{item.detail}</span>
                    </span>
                    <ChevronRight aria-hidden="true" className="mt-4 size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" />
                  </button>
                </motion.li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card tour="cockpit-recommendations" className="xl:col-span-2" title="Recommended actions" icon={<Lightbulb />} action={<Link href="/demo/approvals" className="text-xs text-accent hover:underline">All approvals</Link>}>
            <div className="grid gap-3 md:grid-cols-3">
              {RECOMMENDATIONS.map((rec) => {
                const done = approved.has(rec.id);
                return (
                  <motion.article key={rec.id} layout whileHover={{ y: -2 }} className="flex flex-col rounded-xl border border-border bg-surface-2/40 p-4">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={rec.confidence === "High" ? "success" : "warning"}>{rec.confidence} confidence</Badge>
                      <Badge>{rec.effort} effort</Badge>
                    </div>
                    <h3 className="mt-3 text-sm leading-snug font-semibold">{rec.title}</h3>
                    <p className="mt-1.5 text-xs text-muted">{rec.problem}</p>
                    <p className="mt-2 text-xs font-medium text-accent">{rec.impact}</p>
                    <p className="mt-auto pt-3 text-[11px] text-muted">Proposed by {rec.owner}</p>
                    <div className="mt-3">
                      <AnimatePresence mode="wait" initial={false}>
                        {done ? (
                          <motion.p key="ok" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center justify-center gap-1.5 rounded-lg bg-success/12 py-2 text-sm font-medium text-success">
                            <Check aria-hidden="true" className="size-4" /> Approved
                          </motion.p>
                        ) : (
                          <motion.div key="btn" exit={{ opacity: 0, scale: 0.95 }}>
                            <DemoButton variant="primary" className="w-full" onClick={() => approve(rec.id, rec.title)}>Approve</DemoButton>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </Card>

          <Card title="Pipeline by channel" icon={<PieChart />}>
            <Donut
              data={CHANNEL_MIX}
              format={formatCompactEur}
              center={
                <>
                  <span className="text-xl font-semibold">{formatCompactEur(mixTotal)}</span>
                  <span className="text-[11px] text-muted">total pipeline</span>
                </>
              }
            />
            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {CHANNEL_MIX.map((slice, i) => (
                <li key={slice.name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-muted">
                    <span className="size-2 rounded-full" style={{ background: colors.series[i % colors.series.length] }} />
                    {slice.name}
                  </span>
                  <span className="font-medium tabular">{Math.round((slice.value / mixTotal) * 100)}%</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card title="Agent activity" icon={<Bot />} action={<Link href="/demo/automations" className="text-xs text-accent hover:underline">Open automations</Link>}>
          <ol className="relative grid gap-4 md:grid-cols-4">
            <span aria-hidden="true" className="absolute top-3 right-6 left-6 hidden h-px bg-gradient-to-r from-primary/60 via-border to-transparent md:block" />
            {AGENT_ACTIVITY.map((event, i) => (
              <motion.li key={event.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.1 }} className="relative">
                <span className={`relative z-10 grid size-6 place-items-center rounded-full border ${event.status === "running" ? "border-accent bg-primary/20" : event.status === "waiting" ? "border-warning bg-warning/15" : "border-success bg-success/15"}`}>
                  <StatusDot tone={event.status === "running" ? "primary" : event.status === "waiting" ? "warning" : "success"} pulse={event.status === "running"} />
                </span>
                <p className="mt-3 text-sm font-medium">{event.agent}</p>
                <p className="text-xs text-muted">{event.action}</p>
                <p className="mt-1 text-[11px] text-muted/80">{event.status === "waiting" ? "Waiting for approval · " : ""}{event.time}</p>
              </motion.li>
            ))}
          </ol>
        </Card>
      </Stagger>
    </>
  );
}
