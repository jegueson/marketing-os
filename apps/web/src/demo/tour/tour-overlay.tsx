"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TourStep } from "./steps";

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 10;
const CARD_WIDTH = 360;
const FIND_TIMEOUT_MS = 2500;

type Props = {
  step: TourStep;
  index: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onExit: () => void;
};

/** Spotlights the step target and shows a narration card next to it. */
export function TourOverlay({ step, index, total, onNext, onPrev, onExit }: Props) {
  const rect = useTargetRect(step.target);
  const cardRef = useRef<HTMLDivElement>(null);
  const last = index === total - 1;

  useEffect(() => {
    cardRef.current?.focus();
  }, [step]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      }
      if (event.key === "Escape") onExit();
      if (event.key === "ArrowRight") onNext();
      if (event.key === "ArrowLeft") onPrev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit, onNext, onPrev]);

  return (
    // The page stays clickable under the spotlight so the presenter can demo live.
    <div className="pointer-events-none fixed inset-0 z-[60]">
      <AnimatePresence>
        {rect ? (
          <motion.div
            key="spot"
            aria-hidden="true"
            className="pointer-events-none absolute rounded-2xl ring-2 ring-accent"
            style={{ boxShadow: "0 0 0 9999px rgb(2 6 23 / 0.62), 0 0 40px 6px rgb(59 130 246 / 0.45)" }}
            initial={false}
            animate={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
            transition={{ type: "spring", stiffness: 220, damping: 30 }}
          />
        ) : (
          <motion.div key="dim" aria-hidden="true" className="absolute inset-0 bg-slate-950/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
        )}
      </AnimatePresence>

      <motion.div
        ref={cardRef}
        key={step.target}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        tabIndex={-1}
        className="glass glow-ring focus-ring pointer-events-auto absolute rounded-2xl p-5 text-fg shadow-2xl"
        style={{ width: CARD_WIDTH, ...cardPosition(rect) }}
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.12 }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-widest text-accent uppercase">{step.eyebrow}</span>
          <button type="button" onClick={onExit} aria-label="Close tour" className="focus-ring -m-1 rounded-md p-1 text-muted hover:text-fg">
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <h2 id="tour-title" className="mt-2 text-lg leading-snug font-semibold text-balance">
          {step.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
        <div className="mt-5 flex items-center justify-between">
          <div className="flex gap-1" aria-label={`Step ${index + 1} of ${total}`}>
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? "w-5 bg-accent" : "w-1.5 bg-muted/40"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onPrev}
              disabled={index === 0}
              className="focus-ring inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition hover:text-fg disabled:opacity-40"
            >
              <ArrowLeft aria-hidden="true" className="size-3.5" /> Back
            </button>
            <button
              type="button"
              onClick={onNext}
              className="focus-ring inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-strong"
            >
              {last ? "Finish" : "Next"} <ArrowRight aria-hidden="true" className="size-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

type CardPosition = { top?: number; left?: number; right?: number; bottom?: number; margin?: string; height?: string };

function cardPosition(rect: Rect | null): CardPosition {
  // Centered without a transform, because Motion owns transform for the entrance animation.
  if (!rect) return { top: 0, left: 0, right: 0, bottom: 0, margin: "auto", height: "fit-content" };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.min(Math.max(16, rect.left), vw - CARD_WIDTH - 16);
  const below = rect.top + rect.height + PAD * 2 + 12;
  if (below + 220 < vh) return { top: below, left };
  const above = rect.top - PAD * 2 - 12 - 220;
  if (above > 16) return { top: above, left };
  // Target fills the screen: pin the card bottom-right.
  return { right: 24, bottom: 24 };
}

/** Finds the target (it may mount after a route change), scrolls to it and tracks its box. */
function useTargetRect(target: string): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    let element: Element | null = null;
    let frame = 0;
    const startedAt = performance.now();

    const measure = () => {
      if (!element) return;
      const box = element.getBoundingClientRect();
      setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
    };

    const find = () => {
      element = document.querySelector(`[data-tour="${target}"]`);
      if (element) {
        element.scrollIntoView({ block: "center", behavior: "smooth" });
        window.setTimeout(measure, 450);
        measure();
        return;
      }
      if (performance.now() - startedAt < FIND_TIMEOUT_MS) {
        frame = requestAnimationFrame(find);
      } else {
        console.warn(`Tour target not found: ${target}`);
        setRect(null);
      }
    };

    setRect(null);
    find();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [target]);

  return rect;
}
