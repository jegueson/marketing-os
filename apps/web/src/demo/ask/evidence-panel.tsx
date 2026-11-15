"use client";

import { motion } from "motion/react";
import { Check, FileSearch, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { AskAnswer } from "@/demo/data/ask";

const STEP_MS = 420;

/** Query plan stepper. Steps tick through once per new answer. */
export function EvidencePanel({ answer }: { answer: AskAnswer | null }) {
  const [completed, setCompleted] = useState(0);

  useEffect(() => {
    if (!answer) return;
    setCompleted(0);
    const timer = window.setInterval(() => {
      setCompleted((current) => {
        if (current >= answer.plan.length) window.clearInterval(timer);
        return Math.min(current + 1, answer.plan.length);
      });
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [answer]);

  return (
    <aside data-tour="ask-evidence" className="glass rounded-2xl p-5" aria-label="Evidence and query plan">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <FileSearch aria-hidden="true" className="size-4 text-accent" /> Evidence
      </h2>
      {answer ? (
        <ol className="relative mt-4 flex flex-col gap-4">
          <span aria-hidden="true" className="absolute top-3 bottom-3 left-[13px] w-px bg-border" />
          {answer.plan.map((item, i) => {
            const state = i < completed ? "done" : i === completed ? "running" : "pending";
            return (
              <motion.li key={`${answer.id}-${item.step}`} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="relative flex gap-3">
                <span
                  className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full border transition-colors duration-300 ${state === "done" ? "border-primary bg-primary text-white" : state === "running" ? "border-accent bg-surface-2 text-accent" : "border-border bg-surface-2 text-muted"}`}
                >
                  {state === "done" ? <Check aria-hidden="true" className="size-3.5" /> : state === "running" ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" /> : <span className="text-[10px]">{i + 1}</span>}
                </span>
                <span>
                  <span className="block text-sm font-medium">{item.step}</span>
                  <span className="block text-xs text-muted">{item.detail}</span>
                </span>
              </motion.li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-muted">Ask a question to see how the answer is built.</p>
      )}
      <p className="mt-5 rounded-lg bg-surface-2/60 p-3 text-[11px] leading-relaxed text-muted">
        Read-only queries. Answers only use sources this workspace is allowed to see, and always state their freshness.
      </p>
    </aside>
  );
}
