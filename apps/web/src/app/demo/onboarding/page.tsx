"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Loader2, Target } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ConnectorMark } from "@/demo/components/connector-tile";
import { Logo } from "@/demo/components/shell/logo";
import { DemoButton } from "@/demo/components/ui/buttons";
import { CONNECTORS } from "@/demo/data/company";

const STEPS = ["Connect your stack", "Choose scopes", "Set goals", "Build cockpit"] as const;

const SCOPES = [
  { id: "ga4-prop", source: "Google Analytics 4", label: "acmecloud.com · production" },
  { id: "gads-eu", source: "Google Ads", label: "Acme Cloud EU" },
  { id: "gads-us", source: "Google Ads", label: "Acme Cloud US" },
  { id: "meta-main", source: "Meta Ads", label: "Acme Cloud · main ad account" },
  { id: "hs-portal", source: "HubSpot", label: "Portal 4419 · contacts and deals" },
] as const;

const GOALS = [
  { id: "pipeline", label: "Marketing pipeline", unit: "€", min: 500, max: 2000, initial: 1200, suffix: "K / month" },
  { id: "sql", label: "Qualified leads", unit: "", min: 300, max: 1500, initial: 900, suffix: " / month" },
  { id: "cac", label: "Blended CAC ceiling", unit: "€", min: 100, max: 400, initial: 220, suffix: "" },
] as const;

const BUILD_TASKS = [
  "Authorizing read-only access",
  "Syncing 90 days of history",
  "Mapping metrics to definitions",
  "Checking data health",
  "Composing your cockpit",
] as const;

const TASK_MS = 700;

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [stack, setStack] = useState<ReadonlySet<string>>(new Set(["ga4", "gads", "meta", "hubspot"]));
  const [scopes, setScopes] = useState<ReadonlySet<string>>(new Set(SCOPES.map((s) => s.id)));
  const [goals, setGoals] = useState<Record<string, number>>(Object.fromEntries(GOALS.map((g) => [g.id, g.initial])));
  const [built, setBuilt] = useState(0);

  useEffect(() => {
    if (step !== 3) return;
    setBuilt(0);
    const timer = window.setInterval(() => {
      setBuilt((n) => {
        if (n >= BUILD_TASKS.length) window.clearInterval(timer);
        return Math.min(n + 1, BUILD_TASKS.length);
      });
    }, TASK_MS);
    return () => window.clearInterval(timer);
  }, [step]);

  const toggle = (set: ReadonlySet<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const canContinue = step === 0 ? stack.size > 0 : step === 1 ? scopes.size > 0 : true;

  return (
    <div className="relative z-10 mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-8">
      <header className="flex items-center gap-3">
        <Logo />
        <span className="font-semibold">Marketing OS</span>
        <Link href="/demo/cockpit" className="ml-auto text-sm text-muted hover:text-fg">Skip to cockpit</Link>
      </header>

      <ol className="mt-10 grid grid-cols-4 gap-2" aria-label="Onboarding progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-col gap-2">
            <span className="h-1 overflow-hidden rounded-full bg-muted/15">
              <motion.span className="block h-full bg-accent" initial={false} animate={{ width: i <= step ? "100%" : "0%" }} transition={{ duration: 0.5 }} />
            </span>
            <span className={`text-xs ${i === step ? "font-semibold text-fg" : "text-muted"}`} aria-current={i === step ? "step" : undefined}>{i + 1}. {label}</span>
          </li>
        ))}
      </ol>

      <div className="glass mt-8 min-h-[420px] rounded-3xl p-6 sm:p-8">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ type: "spring", stiffness: 260, damping: 28 }}>
            {step === 0 ? (
              <section data-tour="onboarding-stack" aria-labelledby="ob-title">
                <h1 id="ob-title" className="text-2xl font-semibold tracking-tight">Which tools does your team use?</h1>
                <p className="mt-1 text-sm text-muted">Pick your sources. Access is read-only until a policy allows writes.</p>
                <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {CONNECTORS.map((c) => {
                    const on = stack.has(c.id);
                    return (
                      <li key={c.id}>
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.96 }}
                          aria-pressed={on}
                          onClick={() => setStack((s) => toggle(s, c.id))}
                          className={`focus-ring relative flex w-full cursor-pointer flex-col items-center gap-2 rounded-2xl border p-4 text-center transition ${on ? "border-primary/60 bg-primary/10" : "border-border bg-surface-2/40 hover:border-accent/40"}`}
                        >
                          <ConnectorMark connector={c} />
                          <span className="text-xs font-medium">{c.name}</span>
                          <AnimatePresence>
                            {on ? (
                              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-primary text-white">
                                <Check aria-hidden="true" className="size-3" />
                              </motion.span>
                            ) : null}
                          </AnimatePresence>
                        </motion.button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {step === 1 ? (
              <section aria-labelledby="ob-scope">
                <h1 id="ob-scope" className="text-2xl font-semibold tracking-tight">Choose what to sync</h1>
                <p className="mt-1 text-sm text-muted">Only selected accounts and properties are read. You can change this later.</p>
                <ul className="mt-6 flex flex-col gap-2">
                  {SCOPES.map((s) => (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface-2/40 p-4 transition hover:border-accent/40">
                        <input type="checkbox" checked={scopes.has(s.id)} onChange={() => setScopes((v) => toggle(v, s.id))} className="size-4 accent-[var(--mos-primary)]" />
                        <span className="flex-1">
                          <span className="block text-sm font-medium">{s.label}</span>
                          <span className="block text-xs text-muted">{s.source}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {step === 2 ? (
              <section aria-labelledby="ob-goals">
                <h1 id="ob-goals" className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><Target aria-hidden="true" className="size-6 text-accent" /> Set your targets</h1>
                <p className="mt-1 text-sm text-muted">KPI cards compare every number with these targets.</p>
                <div className="mt-8 flex flex-col gap-7">
                  {GOALS.map((g) => (
                    <div key={g.id}>
                      <label htmlFor={`goal-${g.id}`} className="flex items-center justify-between text-sm">
                        <span className="font-medium">{g.label}</span>
                        <span className="font-semibold text-accent tabular">{g.unit}{goals[g.id]}{g.suffix}</span>
                      </label>
                      <input
                        id={`goal-${g.id}`}
                        type="range"
                        min={g.min}
                        max={g.max}
                        step={10}
                        value={goals[g.id]}
                        onChange={(e) => setGoals((v) => ({ ...v, [g.id]: Number(e.target.value) }))}
                        className="mt-3 w-full accent-[var(--mos-primary)]"
                      />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {step === 3 ? (
              <section aria-labelledby="ob-build" aria-live="polite">
                <h1 id="ob-build" className="text-2xl font-semibold tracking-tight">Building your cockpit</h1>
                <p className="mt-1 text-sm text-muted">{stack.size} sources · {scopes.size} scopes · 3 targets</p>
                <ul className="mt-8 flex flex-col gap-3">
                  {BUILD_TASKS.map((task, i) => {
                    const done = i < built;
                    const active = i === built;
                    return (
                      <motion.li key={task} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="flex items-center gap-3 text-sm">
                        <span className={`grid size-7 place-items-center rounded-full border transition-colors ${done ? "border-primary bg-primary text-white" : active ? "border-accent text-accent" : "border-border text-muted"}`}>
                          {done ? <Check aria-hidden="true" className="size-3.5" /> : active ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" /> : <span className="text-[10px]">{i + 1}</span>}
                        </span>
                        <span className={done ? "" : "text-muted"}>{task}</span>
                      </motion.li>
                    );
                  })}
                </ul>
                <AnimatePresence>
                  {built >= BUILD_TASKS.length ? (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mt-8 rounded-2xl border border-success/30 bg-success/10 p-5">
                      <p className="font-semibold text-success">Cockpit ready in 3 minutes 12 seconds</p>
                      <p className="mt-1 text-sm text-muted">First insight found: Meta retargeting CPA is 92% above brand search.</p>
                      <Link href="/demo/cockpit" className="focus-ring mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-strong">
                        Open my cockpit <ArrowRight aria-hidden="true" className="size-4" />
                      </Link>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </section>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      {step < 3 ? (
        <div className="mt-6 flex justify-between">
          <DemoButton variant="ghost" icon={<ArrowLeft />} onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</DemoButton>
          <DemoButton variant="primary" onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
            {step === 2 ? "Build my cockpit" : "Continue"} <ArrowRight aria-hidden="true" className="size-4" />
          </DemoButton>
        </div>
      ) : null}
    </div>
  );
}
