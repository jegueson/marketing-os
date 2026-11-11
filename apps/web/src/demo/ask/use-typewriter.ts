"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

const CHARS_PER_TICK = 3;
const TICK_MS = 16;

/** Reveals text progressively to mimic a streamed model answer. */
export function useTypewriter(text: string, enabled: boolean): { shown: string; done: boolean } {
  const reduced = useReducedMotion();
  const [length, setLength] = useState(enabled && !reduced ? 0 : text.length);

  useEffect(() => {
    if (!enabled || reduced) {
      setLength(text.length);
      return;
    }
    setLength(0);
    const timer = window.setInterval(() => {
      setLength((current) => {
        const next = current + CHARS_PER_TICK;
        if (next >= text.length) window.clearInterval(timer);
        return Math.min(next, text.length);
      });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [text, enabled, reduced]);

  return { shown: text.slice(0, length), done: length >= text.length };
}
