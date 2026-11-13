"use client";

import { AnimatePresence, motion } from "motion/react";
import { Bot, Building2, FlaskConical, GitBranch, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge, type Tone } from "@/demo/components/ui/badges";
import { DemoButton, Segmented } from "@/demo/components/ui/buttons";
import { PageHeader } from "@/demo/components/ui/page-header";
import { InlineBar } from "@/demo/components/viz";
import { useToast } from "@/demo/components/toast";
import { AGENTS, AUTONOMY_LEVELS, CUSTOMERS, PROMPTS, SKILLS } from "@/demo/data/console";
import type { Autonomy } from "@/demo/data/operate";
import { formatNumber } from "@/demo/lib/format";

const TABS = [
  { id: "skills", label: "Skills" },
  { id: "agents", label: "Agents" },
  { id: "prompts", label: "Prompts" },
  { id: "customers", label: "Customers" },
] as const;

type Tab = (typeof TABS)[number]["id"];

const AUTHOR_TONE: Record<string, Tone> = { Core: "primary", "Expert Services": "violet", Community: "neutral" };

export default function ConsolePage() {
  const [tab, setTab] = useState<Tab>("skills");
  return (
    <>
      <PageHeader
        title="Specialist console"
        subtitle="Where specialists shape skills, agents and prompts for each customer, with evals on every change."
        actions={<DemoButton variant="primary" icon={<Plus />}>New skill</DemoButton>}
      />
      <div data-tour="console-tabs" className="flex flex-col gap-4">
        <Segmented label="Console sections" options={TABS} value={tab} onChange={setTab} />
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
            {tab === "skills" ? <SkillsTab /> : null}
            {tab === "agents" ? <AgentsTab /> : null}
            {tab === "prompts" ? <PromptsTab /> : null}
            {tab === "customers" ? <CustomersTab /> : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}

function SkillsTab() {
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {SKILLS.map((s, i) => (
        <motion.li key={s.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ y: -3 }} className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-accent"><Sparkles aria-hidden="true" className="size-4" /></span>
            <Badge tone={AUTHOR_TONE[s.author] ?? "neutral"}>{s.author}</Badge>
          </div>
          <h3 className="mt-3 text-sm font-semibold">{s.name}</h3>
          <p className="text-xs text-muted">{s.area} · {s.version} · used {formatNumber(s.uses)} times</p>
          <div className="mt-4 flex items-center gap-3">
            <FlaskConical aria-hidden="true" className="size-3.5 text-muted" />
            <InlineBar value={s.evalScore} max={100} />
            <span className="text-xs font-semibold tabular">{s.evalScore}</span>
          </div>
          <p className="mt-1 text-[11px] text-muted">Eval score on 40 golden cases</p>
        </motion.li>
      ))}
    </ul>
  );
}

function AgentsTab() {
  const [levels, setLevels] = useState<Record<string, Autonomy>>(Object.fromEntries(AGENTS.map((a) => [a.id, a.autonomy])));
  const notify = useToast();
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {AGENTS.map((a) => (
        <li key={a.id} className="glass rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-slate-600 text-white"><Bot aria-hidden="true" className="size-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{a.name}</span>
              <span className="block text-xs text-muted">{a.purpose}</span>
              <span className="mt-1 block text-[11px] text-muted">{a.skills} skills · {a.model}</span>
            </span>
          </div>
          <p className="mt-4 mb-2 text-xs font-medium text-muted">Autonomy</p>
          <Segmented
            label={`${a.name} autonomy`}
            options={AUTONOMY_LEVELS}
            value={levels[a.id] ?? a.autonomy}
            onChange={(level) => {
              setLevels((l) => ({ ...l, [a.id]: level }));
              notify({ tone: "info", title: "Autonomy updated", body: `${a.name} → ${level}. Policy change logged.` });
            }}
          />
        </li>
      ))}
    </ul>
  );
}

function PromptsTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {PROMPTS.map((p) => (
        <section key={p.id} className="glass rounded-2xl p-5" aria-labelledby={`prompt-${p.id}`}>
          <h3 id={`prompt-${p.id}`} className="flex items-center gap-2 font-mono text-sm font-medium">
            <GitBranch aria-hidden="true" className="size-4 text-accent" /> {p.name}
          </h3>
          <ol className="relative mt-4 flex flex-col gap-4 pl-5">
            <span aria-hidden="true" className="absolute top-1 bottom-1 left-[5px] w-px bg-border" />
            {p.versions.map((v) => (
              <li key={v.version} className="relative">
                <span aria-hidden="true" className={`absolute top-1.5 -left-5 size-2.5 rounded-full ${v.live ? "bg-accent ring-4 ring-primary/20" : "bg-muted/50"}`} />
                <p className="flex items-center gap-2 text-sm">
                  <span className="font-semibold">{v.version}</span>
                  {v.live ? <Badge tone="success">live</Badge> : null}
                  <span className="ml-auto text-xs text-muted">{v.date}</span>
                </p>
                <p className="text-xs text-muted">{v.note}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <InlineBar value={v.evalScore} max={100} />
                  <span className="text-xs font-semibold tabular">{v.evalScore}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function CustomersTab() {
  return (
    <div className="glass overflow-x-auto rounded-2xl">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-xs text-muted">
          <tr className="border-b border-border">
            <th scope="col" className="px-5 py-3 font-medium">Customer</th>
            <th scope="col" className="px-3 py-3 font-medium">Plan</th>
            <th scope="col" className="px-3 py-3 font-medium">Sources</th>
            <th scope="col" className="px-3 py-3 font-medium">Automations</th>
            <th scope="col" className="px-3 py-3 font-medium">Credits (30 d)</th>
            <th scope="col" className="px-5 py-3 font-medium">Health</th>
          </tr>
        </thead>
        <tbody>
          {CUSTOMERS.map((c) => (
            <tr key={c.name} className="border-b border-border/60 last:border-0 hover:bg-surface-2/40">
              <td className="px-5 py-3 font-medium"><span className="flex items-center gap-2"><Building2 aria-hidden="true" className="size-4 text-muted" />{c.name}</span></td>
              <td className="px-3 py-3 text-muted">{c.plan}</td>
              <td className="px-3 py-3 tabular">{c.sources}</td>
              <td className="px-3 py-3 tabular">{c.automations}</td>
              <td className="px-3 py-3 tabular">{c.credits ? formatNumber(c.credits) : "—"}</td>
              <td className="px-5 py-3"><Badge tone={c.health === "Healthy" ? "success" : c.health === "Attention" ? "warning" : "primary"}>{c.health}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
