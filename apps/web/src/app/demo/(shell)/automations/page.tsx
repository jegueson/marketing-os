"use client";

import { motion } from "motion/react";
import { Bot, Cable, Clock, Coins, History, Play, RotateCcw, Timer, TrendingUp, Workflow } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { WorkflowCanvas, type NodeState } from "@/demo/components/workflow-canvas";
import { AnimatedNumber } from "@/demo/components/ui/animated-number";
import { Badge, type Tone } from "@/demo/components/ui/badges";
import { DemoButton } from "@/demo/components/ui/buttons";
import { Card } from "@/demo/components/ui/card";
import { PageHeader } from "@/demo/components/ui/page-header";
import { Stagger } from "@/demo/components/ui/reveal";
import { useToast } from "@/demo/components/toast";
import {
  AUTOMATIONS,
  AUTOMATION_STATS,
  EXTERNAL_PLATFORMS,
  FLOW_NODES,
  INBOUND_ACTIONS,
  RECENT_RUNS,
  RUN_ORDER,
} from "@/demo/data/operate";
import { formatNumber } from "@/demo/lib/format";

const STEP_MS = 900;

const IDLE: Record<string, NodeState> = Object.fromEntries(FLOW_NODES.map((n) => [n.id, "idle" as const]));
const SETTLED: Record<string, NodeState> = { ...IDLE, n1: "done", n2: "done", n3: "done", n5: "done", n4: "waiting" };

const RUN_TONE: Record<string, Tone> = { Succeeded: "success", Failed: "danger", "Waiting approval": "warning" };

const STATS = [
  { label: "Active automations", value: AUTOMATION_STATS.active, icon: Workflow, format: (v: number) => String(Math.round(v)) },
  { label: "Runs this week", value: AUTOMATION_STATS.runsThisWeek, icon: TrendingUp, format: (v: number) => String(Math.round(v)) },
  { label: "Success rate", value: AUTOMATION_STATS.successRate, icon: Timer, format: (v: number) => `${v.toFixed(1)}%` },
  { label: "Hours saved / week", value: AUTOMATION_STATS.hoursSaved, icon: Clock, format: (v: number) => `${Math.round(v)}h` },
  { label: "AI credits used", value: AUTOMATION_STATS.creditsUsed, icon: Coins, format: (v: number) => formatNumber(Math.round(v)) },
] as const;

export default function AutomationsPage() {
  const [states, setStates] = useState<Record<string, NodeState>>(SETTLED);
  const [running, setRunning] = useState(false);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(Object.fromEntries(AUTOMATIONS.map((a) => [a.id, a.enabled])));
  const timers = useRef<number[]>([]);
  const notify = useToast();

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  function run() {
    timers.current.forEach((t) => window.clearTimeout(t));
    setRunning(true);
    setStates(IDLE);
    RUN_ORDER.forEach((id, i) => {
      const last = i === RUN_ORDER.length - 1;
      timers.current.push(
        window.setTimeout(() => setStates((s) => ({ ...s, [id]: "running" })), i * STEP_MS + 150),
        window.setTimeout(() => {
          setStates((s) => ({ ...s, [id]: last ? "waiting" : "done" }));
          if (last) {
            setRunning(false);
            notify({ tone: "warning", title: "Approval requested", body: "Pause 3 Meta ad sets is waiting for Lena H." });
          }
        }, (i + 1) * STEP_MS),
      );
    });
  }

  return (
    <>
      <PageHeader title="Automations" subtitle="Recurring marketing work run by agents, gated by policies and human approval." />
      <Stagger className="grid gap-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {STATS.map((s) => (
            <Card key={s.label} bodyClassName="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-accent"><s.icon aria-hidden="true" className="size-5" /></span>
              <span>
                <span className="block text-xs text-muted">{s.label}</span>
                <span className="block text-xl font-semibold"><AnimatedNumber value={s.value} format={s.format} /></span>
              </span>
            </Card>
          ))}
        </div>

        <Card
          tour="automations-canvas"
          title="Weekly paid media optimization"
          icon={<Workflow />}
          action={
            <div className="flex items-center gap-2">
              <Badge tone="warning">Act with approval</Badge>
              <DemoButton variant="ghost" icon={<RotateCcw />} onClick={() => setStates(SETTLED)} disabled={running}>Reset</DemoButton>
              <DemoButton variant="primary" icon={<Play />} onClick={run} disabled={running}>{running ? "Running…" : "Run now"}</DemoButton>
            </div>
          }
        >
          <div className="overflow-x-auto pb-1">
            <WorkflowCanvas states={states} />
          </div>
          <p className="mt-3 text-xs text-muted">
            The run stops at the approval node because the policy requires a budget owner for ad-platform writes.{" "}
            <Link href="/demo/approvals" className="text-accent hover:underline">Open the approval</Link>
          </p>
        </Card>

        <div className="grid gap-4 xl:grid-cols-5">
          <Card className="xl:col-span-3" title="All automations" icon={<Bot />} bodyClassName="px-0 pb-2">
            <ul>
              {AUTOMATIONS.map((a) => {
                const on = enabled[a.id] ?? false;
                return (
                  <li key={a.id} className="flex items-center gap-4 border-b border-border/60 px-5 py-3 last:border-0">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.name}</span>
                      <span className="block text-xs text-muted">{a.schedule} · {a.agent}</span>
                    </span>
                    <Badge tone={a.autonomy === "Observe" ? "neutral" : a.autonomy === "Act" ? "primary" : "warning"} className="hidden sm:inline-flex">{a.autonomy}</Badge>
                    <span className="hidden w-16 text-right text-xs text-muted tabular md:block">{a.success}%</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`${on ? "Disable" : "Enable"} ${a.name}`}
                      onClick={() => setEnabled((e) => ({ ...e, [a.id]: !on }))}
                      className={`focus-ring relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${on ? "bg-primary" : "bg-muted/30"}`}
                    >
                      <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 32 }} className={`absolute top-0.5 size-5 rounded-full bg-white shadow ${on ? "right-0.5" : "left-0.5"}`} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="xl:col-span-2" title="Recent runs" icon={<History />}>
            <ul className="flex flex-col gap-2.5">
              {RECENT_RUNS.map((r) => (
                <li key={r.id} className="rounded-xl border border-border bg-surface-2/40 p-3">
                  <p className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{r.automation}</span>
                    <Badge tone={RUN_TONE[r.status] ?? "neutral"}>{r.status}</Badge>
                  </p>
                  <p className="mt-1 text-xs text-muted">{r.started} · {r.duration} · {r.credits} credits</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card
          tour="automations-external"
          title="Connected automation platforms"
          icon={<Cable />}
          bodyClassName="grid gap-4 xl:grid-cols-2"
        >
          <ul className="flex flex-col gap-3">
            {EXTERNAL_PLATFORMS.map((p) => (
              <li key={p.id} className="rounded-xl border border-border bg-surface-2/40 p-3">
                <p className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-semibold">{p.name}</span>
                  <Badge tone={p.status === "Connected" ? "success" : "warning"}>{p.status}</Badge>
                </p>
                <p className="mt-1 text-xs text-muted">
                  {p.events.length > 0 ? p.events.join(" · ") : "No event subscriptions yet"}
                </p>
                <p className="mt-1 text-xs text-muted">Last delivery · {p.lastDelivery}</p>
              </li>
            ))}
          </ul>
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Inbound actions</p>
            <ul className="flex flex-col gap-2.5">
              {INBOUND_ACTIONS.map((a) => (
                <li key={a.id} className="rounded-xl border border-border bg-surface-2/40 p-3">
                  <p className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{a.source} · {a.action}</span>
                    <Badge tone={a.status.includes("Approval") ? "warning" : "success"}>{a.status}</Badge>
                  </p>
                  <p className="mt-1 text-xs text-muted">{a.detail}</p>
                  <p className="mt-1 text-xs text-muted">{a.when}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              Native workflows stay for governed agent work. Teams keep n8n, Zapier or Make for glue — Marketing OS sends signed events and accepts scoped actions (ADR-0022).
            </p>
          </div>
        </Card>
      </Stagger>
    </>
  );
}
