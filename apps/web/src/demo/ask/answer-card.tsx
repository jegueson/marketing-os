"use client";

import { AnimatePresence, motion } from "motion/react";
import { Clock, Database, ShieldCheck, Sparkles } from "lucide-react";
import { MiniLine } from "@/demo/components/charts";
import { Badge } from "@/demo/components/ui/badges";
import type { AskAnswer } from "@/demo/data/ask";
import { formatCompactEur, formatNumber } from "@/demo/lib/format";
import { useTypewriter } from "./use-typewriter";

export function AnswerCard({ answer, animate, onFollowUp }: { answer: AskAnswer; animate: boolean; onFollowUp: (q: string) => void }) {
  const { shown, done } = useTypewriter(answer.summary, animate);
  const format = answer.chartKind === "eur" ? formatCompactEur : formatNumber;

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-primary/15 text-accent">
          <Sparkles aria-hidden="true" className="size-4" />
        </span>
        <p className="text-sm font-semibold">Answer</p>
        <Badge tone={answer.confidence === "High" ? "success" : "warning"} className="ml-auto">
          <ShieldCheck aria-hidden="true" className="size-3" /> {answer.confidence} confidence
        </Badge>
      </div>

      <p className="mt-3 text-sm leading-relaxed" aria-live="polite">
        {shown}
        {!done ? <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-accent" /> : null}
      </p>

      <AnimatePresence>
        {done ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mt-4 grid gap-4">
            <div className="rounded-xl border border-border bg-surface-2/40 p-4">
              <p className="text-xs font-semibold text-muted">{answer.chartTitle}</p>
              <MiniLine data={answer.chart} format={format} />
            </div>

            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2/60 text-muted">
                  <tr>
                    {answer.table.headers.map((h) => (
                      <th key={h} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {answer.table.rows.map((row, i) => (
                    <motion.tr key={row.join("|")} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 + i * 0.07 }} className="border-t border-border">
                      {row.map((cell, j) => (
                        <td key={j} className={`px-3 py-2 whitespace-nowrap ${j === 0 ? "font-medium" : "text-muted tabular"}`}>{cell}</td>
                      ))}
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="flex items-center gap-1 text-muted"><Database aria-hidden="true" className="size-3.5" /> Sources</span>
              {answer.sources.map((s) => (
                <Badge key={s} tone="primary">{s}</Badge>
              ))}
              <span className="ml-auto flex items-center gap-1 text-muted"><Clock aria-hidden="true" className="size-3.5" /> {answer.freshness} · {answer.timeRange}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {answer.followUps.map((q) => (
                <button key={q} type="button" onClick={() => onFollowUp(q)} className="focus-ring cursor-pointer rounded-full border border-border px-3 py-1.5 text-xs text-muted transition hover:border-accent/50 hover:text-fg">
                  {q}
                </button>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
