"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

type Props = {
  value: number;
  format: (value: number) => string;
  duration?: number;
  className?: string;
};

/** Counts up from zero the first time it scrolls into view. */
export function AnimatedNumber({ value, format, duration = 1.2, className = "" }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: setDisplay });
    return () => controls.stop();
  }, [inView, value, duration, reduced]);

  return (
    <span ref={ref} className={`tabular ${className}`}>
      <span className="sr-only">{format(value)}</span>
      <span aria-hidden="true">{format(display)}</span>
    </span>
  );
}
