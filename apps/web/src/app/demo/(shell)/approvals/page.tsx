"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, CircleCheck, Clock, Gavel, Inbox, ScrollText, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { Badge, type Tone } from "@/demo/components/ui/badges";
import { DemoButton } from "@/demo/components/ui/buttons";
import { Card } from "@/demo/components/ui/card";
import { PageHeader } from "@/demo/components/ui/page-header";
import { Stagger } from "@/demo/components/ui/reveal";
import { useToast } from "@/demo/components/toast";
import { APPROVALS, type Approval } from "@/demo/data/operate";

type Decision = "approved" | "rejected";

const RISK_TONE: Record<Approval["risk"], Tone> = { Low: "success", Medium: "warning", High: "danger" };

export default function ApprovalsPage() {
  const [selectedId, setSelectedId] = useState(APPROVALS[0]?.id ?? "");
  const [decisions, setDecisions] = useState<Readonly<Record<string, Decision>>>({});
  const notify = useToast();
  const selected = APPROVALS.find((a) => a.id === selectedId) ?? null;
  const pending = APPROVALS.filter((a) => !decisions[a.id]);

  function decide(approval: Approval, decision: Decision) {
    setDecisions((d) => ({ ...d, [approval.id]: decision }));
    notify(
      decision === "approved"
        ? { tone: "success", title: "Approved and executed", body: `${approval.title} · ${approval.target}. Logged to audit.` }
        : { tone: "info", title: "Rejected", body: `${approval.agent} will not run this action. Reason saved to audit.` },
    );
    const next = APPROVALS.find((a) => a.id !== approval.id && !decisions[a.id]);
    if (next) window.setTimeout(() => setSelectedId(next.id), 650);
  }

  return (
    <>
      <PageHeader title="Approvals" subtitle="Risky actions wait here. Every decision is stored with its evidence for audit." />
      <Stagger className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <Card title="Queue" icon={<Inbox />} action={<Badge tone="warning">{pending.length} pending</Badge>}>
          <ul className="flex flex-col gap-2">
            {APPROVALS.map((a) => {
              const decision = decisions[a.id];
              const active = a.id === selectedId;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    aria-current={active ? "true" : undefined}
                    className={`focus-ring relative w-full cursor-pointer rounded-xl border p-3.5 text-left transition ${active ? "border-primary/50 bg-primary/10" : "border-border bg-surface-2/40 hover:border-accent/40"}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{a.title}</span>
                      {decision ? (
                        <Badge tone={decision === "approved" ? "success" : "neutral"}>{decision}</Badge>
                      ) : (
                        <Badge tone={RISK_TONE[a.risk]}>{a.risk}</Badge>
                      )}
                    </span>
                    <span className="mt-1 block text-xs text-muted">{a.agent} · {a.impact}</span>
                    <span className="mt-1 flex items-center gap-1 text-[11px] text-muted/80"><Clock aria-hidden="true" className="size-3" /> expires {a.expires}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div key={selected.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ type: "spring", stiffness: 300, damping: 30 }}>
              <Detail approval={selected} decision={decisions[selected.id]} onDecide={(d) => decide(selected, d)} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Stagger>
    </>
  );
}

function Detail({ approval, decision, onDecide }: { approval: Approval; decision: Decision | undefined; onDecide: (d: Decision) => void }) {
  return (
    <section data-tour="approvals-detail" className="glass rounded-2xl p-6" aria-labelledby="approval-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted">{approval.automation} · requested {approval.requested}</p>
          <h2 id="approval-title" className="mt-1 text-xl font-semibold">{approval.title}</h2>
          <p className="mt-1 text-sm text-accent">{approval.impact}</p>
        </div>
        <div className="flex gap-2">
          <Badge tone={RISK_TONE[approval.risk]}>Risk: {approval.risk}</Badge>
          <Badge>Observe → Act with approval</Badge>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck aria-hidden="true" className="size-4 text-accent" /> Evidence</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {approval.evidence.map((e, i) => (
              <motion.li key={e} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.07 }} className="flex gap-2 text-sm text-muted">
                <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" /> {e}
              </motion.li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Gavel aria-hidden="true" className="size-4 text-accent" /> Proposed change on {approval.target}</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {approval.change.map((c) => (
              <li key={c.item} className="rounded-xl border border-border bg-surface-2/40 p-3 text-sm">
                <p className="font-medium">{c.item}</p>
                <p className="mt-1 flex items-center gap-2 text-xs">
                  <span className="text-muted line-through decoration-muted/60">{c.before}</span>
                  <ArrowRight aria-hidden="true" className="size-3.5 text-accent" />
                  <span className="font-semibold">{c.after}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-5 flex items-start gap-2 rounded-xl bg-surface-2/60 p-3 text-xs text-muted">
        <ScrollText aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> Policy: {approval.policy}
      </p>

      <div className="mt-6">
        <AnimatePresence mode="wait" initial={false}>
          {decision ? (
            <motion.p
              key="decided"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold ${decision === "approved" ? "bg-success/12 text-success" : "bg-muted/12 text-muted"}`}
            >
              {decision === "approved" ? <Check aria-hidden="true" className="size-4" /> : <X aria-hidden="true" className="size-4" />}
              {decision === "approved" ? "Approved · executed on the platform and logged" : "Rejected · the agent will not act"}
            </motion.p>
          ) : (
            <motion.div key="actions" exit={{ opacity: 0 }} className="grid gap-3 sm:grid-cols-2">
              <DemoButton variant="primary" className="py-3" icon={<Check />} onClick={() => onDecide("approved")}>Approve</DemoButton>
              <DemoButton className="py-3" icon={<X />} onClick={() => onDecide("rejected")}>Reject</DemoButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
