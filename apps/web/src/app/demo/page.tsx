"use client";

import { motion, useInView } from "motion/react";
import { ArrowRight, Cable, KeyRound, LayoutDashboard, MessagesSquare, Moon, Presentation, Scale, ShieldCheck, Sun, Workflow } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { HeroPreview } from "@/demo/components/landing/hero-preview";
import { Logo } from "@/demo/components/shell/logo";
import { useTheme } from "@/demo/components/theme";
import { COMPANY } from "@/demo/data/company";
import { useTour } from "@/demo/tour/tour-provider";

const THESIS = ["Connect", "Understand", "Display", "Ask", "Design", "Automate", "Execute", "Measure", "Improve"] as const;

const FEATURES = [
  { icon: Cable, title: "Connect the stack you have", body: "GA4, ad platforms, CRM, email and work tools. Read-only by default, with freshness on every source." },
  { icon: LayoutDashboard, title: "One cockpit", body: "Executive KPIs with targets, sources and freshness, plus an attention queue that does the watching." },
  { icon: MessagesSquare, title: "Ask Marketing", body: "Plain-language questions answered from your data, with the query plan and evidence on screen." },
  { icon: Workflow, title: "Governed automation", body: "Agents absorb recurring work. Policies decide when a human approves. Everything is audited." },
] as const;

const OFFERS = [
  { name: "Community", price: "Free", body: "Self-host under AGPL-3.0. Bring your own model key.", highlight: false },
  { name: "Expert Services", price: "Project", body: "A marketing specialist designs skills and workflows for your team.", highlight: false },
  { name: "Marketing OS Cloud", price: "AI credits", body: "We host it. You buy credits for agents and questions.", highlight: true },
  { name: "Enterprise", price: "Licence", body: "Commercial licence, SSO and an SLA.", highlight: false },
] as const;

function Thesis() {
  const ref = useRef<HTMLOListElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <ol ref={ref} className="flex flex-wrap items-center justify-center gap-2">
      {THESIS.map((step, i) => (
        <motion.li
          key={step}
          initial={{ opacity: 0.25, scale: 0.9 }}
          animate={inView ? { opacity: 1, scale: 1 } : {}}
          transition={{ delay: i * 0.12, type: "spring", stiffness: 260, damping: 20 }}
          className="flex items-center gap-2"
        >
          <span className="glass rounded-full px-4 py-2 text-sm font-medium">{step}</span>
          {i < THESIS.length - 1 ? <ArrowRight aria-hidden="true" className="size-4 text-accent" /> : null}
        </motion.li>
      ))}
    </ol>
  );
}

export default function LandingPage() {
  const { theme, toggle } = useTheme();
  const tour = useTour();

  return (
    <div className="relative z-10">
      <header className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-5">
        <Logo />
        <span className="font-semibold">Marketing OS</span>
        <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">pre-alpha · open source</span>
        <button type="button" onClick={toggle} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} className="focus-ring ml-auto grid size-9 cursor-pointer place-items-center rounded-lg border border-border text-muted hover:text-fg">
          {theme === "dark" ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
        </button>
        <Link href="/demo/cockpit" className="focus-ring rounded-lg px-3 py-2 text-sm text-muted hover:text-fg max-sm:hidden">Open demo</Link>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-16 px-6 pt-10 pb-24 lg:grid-cols-2 lg:pt-20">
        <div>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-accent">
            <ShieldCheck aria-hidden="true" className="size-3.5" /> Marketing-only. Governed by default.
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, type: "spring", stiffness: 140, damping: 20 }}
            className="mt-5 text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-6xl"
          >
            The operating system for your{" "}
            <span className="bg-gradient-to-r from-accent via-primary to-slate-400 bg-clip-text text-transparent">marketing team</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="mt-5 max-w-xl text-lg text-muted text-pretty">
            Connect the stack you already use. See it in one cockpit. Ask questions about your own data. Automate the recurring work, with a human approval when the action is risky.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }} className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={tour.start} className="focus-ring inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgb(37_99_235/0.9)] transition hover:bg-primary-strong">
              <Presentation aria-hidden="true" className="size-4" /> Start the investor tour
            </button>
            <Link href="/demo/cockpit" className="focus-ring glass inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition hover:border-accent/50">
              Explore freely <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </motion.div>
          <p className="mt-6 flex items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><Scale aria-hidden="true" className="size-3.5" /> AGPL-3.0</span>
            <span className="flex items-center gap-1.5"><KeyRound aria-hidden="true" className="size-3.5" /> Bring your own model</span>
            <span>Cloudflare + Supabase</span>
          </p>
        </div>
        <HeroPreview />
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24 text-center">
        <h2 className="text-sm font-semibold tracking-widest text-accent uppercase">The product thesis</h2>
        <p className="mx-auto mt-3 max-w-2xl text-2xl font-semibold tracking-tight text-balance">One loop, from raw data to measured improvement</p>
        <div className="mt-10"><Thesis /></div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => (
          <motion.article
            key={f.title}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ delay: i * 0.08, type: "spring", stiffness: 200, damping: 24 }}
            whileHover={{ y: -4 }}
            className="glass rounded-2xl p-6"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-accent"><f.icon aria-hidden="true" className="size-5" /></span>
            <h3 className="mt-4 font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
          </motion.article>
        ))}
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24">
        <h2 className="text-center text-sm font-semibold tracking-widest text-accent uppercase">How it makes money</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-2xl font-semibold tracking-tight text-balance">Open core, with paid hosting and specialist help</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {OFFERS.map((o, i) => (
            <motion.article
              key={o.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.08 }}
              className={`glass rounded-2xl p-6 ${o.highlight ? "glow-ring" : ""}`}
            >
              <p className="text-xs font-semibold text-muted uppercase">{o.price}</p>
              <h3 className="mt-2 text-lg font-semibold">{o.name}</h3>
              <p className="mt-2 text-sm text-muted">{o.body}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <footer className="border-t border-border px-6 py-8 text-center text-xs text-muted">
        Interactive mockup. {COMPANY.legalNote}
      </footer>
    </div>
  );
}
