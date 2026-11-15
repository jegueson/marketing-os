"use client";

import { AnimatePresence, motion } from "motion/react";
import { Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnswerCard } from "@/demo/ask/answer-card";
import { EvidencePanel } from "@/demo/ask/evidence-panel";
import { matchScript } from "@/demo/ask/match";
import { PageHeader } from "@/demo/components/ui/page-header";
import { ASK_SCRIPTS, ASK_STARTERS, type AskAnswer } from "@/demo/data/ask";

type Turn = { id: number; question: string; answer: AskAnswer | null };

const THINKING_MS = 900;
const FIRST = ASK_SCRIPTS[0]!;

export default function AskPage() {
  const [turns, setTurns] = useState<Turn[]>([{ id: 1, question: FIRST.question, answer: FIRST }]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const latest = [...turns].reverse().find((t) => t.answer)?.answer ?? null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, thinking]);

  function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || thinking) return;
    setDraft("");
    setThinking(true);
    window.setTimeout(() => {
      setTurns((current) => [...current, { id: current.length + 1, question: trimmed, answer: matchScript(trimmed, ASK_SCRIPTS) }]);
      setThinking(false);
    }, THINKING_MS);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    ask(draft);
  }

  return (
    <>
      <PageHeader title="Ask Marketing" subtitle="Questions answered from your own data, with sources, time range and freshness." />
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <section data-tour="ask-thread" aria-label="Conversation" className="flex min-h-[60vh] flex-col gap-4">
          {turns.map((turn, i) => (
            <div key={turn.id} className="flex flex-col gap-3">
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-white shadow-[0_8px_24px_-10px_rgb(37_99_235/0.8)]"
              >
                {turn.question}
              </motion.p>
              {turn.answer ? (
                <AnswerCard answer={turn.answer} animate={i === turns.length - 1} onFollowUp={ask} />
              ) : (
                <div className="glass rounded-2xl p-5 text-sm text-muted">
                  This demo answers a few scripted questions. Try one of these:
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ASK_STARTERS.map((q) => (
                      <button key={q} type="button" onClick={() => ask(q)} className="focus-ring cursor-pointer rounded-full border border-border px-3 py-1.5 text-xs transition hover:border-accent/50 hover:text-fg">{q}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          <AnimatePresence>
            {thinking ? (
              <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="glass flex items-center gap-3 rounded-2xl p-4 text-sm text-muted" role="status">
                <Sparkles aria-hidden="true" className="size-4 animate-pulse text-accent" />
                Planning query across connected sources
                <span className="shimmer ml-auto h-2 w-32 rounded-full" />
              </motion.div>
            ) : null}
          </AnimatePresence>
          <div ref={endRef} />

          <form onSubmit={onSubmit} className="sticky bottom-4 mt-auto">
            <label htmlFor="ask-input" className="sr-only">Ask a question about your marketing data</label>
            <div className="glass glow-ring flex items-center gap-2 rounded-2xl p-2 pl-4">
              <input
                id="ask-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask a follow-up, e.g. 'Which campaigns are inefficient?'"
                className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted/70"
                autoComplete="off"
              />
              <button type="submit" disabled={!draft.trim() || thinking} aria-label="Send question" className="focus-ring grid size-10 cursor-pointer place-items-center rounded-xl bg-primary text-white transition hover:bg-primary-strong disabled:opacity-40">
                <Send aria-hidden="true" className="size-4" />
              </button>
            </div>
          </form>
        </section>

        <div className="xl:sticky xl:top-20 xl:self-start">
          <EvidencePanel answer={latest} />
        </div>
      </div>
    </>
  );
}
