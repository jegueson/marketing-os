"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { CircleCheck, Sparkles, TrendingUp } from "lucide-react";
import type { MouseEvent } from "react";
import { Sparkline } from "../charts";

const SPARK = [31, 33, 32, 36, 35, 39, 41, 40, 44, 47, 46, 51];

/** Floating product preview that tilts toward the pointer. */
export function HeroPreview() {
  const reduced = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-8, 8]), { stiffness: 140, damping: 18 });
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [6, -6]), { stiffness: 140, damping: 18 });

  function onMove(event: MouseEvent<HTMLDivElement>) {
    if (reduced) return;
    const box = event.currentTarget.getBoundingClientRect();
    mx.set((event.clientX - box.left) / box.width - 0.5);
    my.set((event.clientY - box.top) / box.height - 0.5);
  }

  return (
    <div className="relative [perspective:1200px]" onMouseMove={onMove} onMouseLeave={() => { mx.set(0); my.set(0); }} aria-hidden="true">
      <motion.div style={{ rotateX, rotateY }} className="relative">
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.25 }}
          className="glass glow-ring rounded-3xl p-5"
        >
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-danger/70" />
            <span className="size-2.5 rounded-full bg-warning/70" />
            <span className="size-2.5 rounded-full bg-success/70" />
            <span className="ml-3 text-[11px] text-muted">Cockpit · Acme Cloud</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              ["Pipeline", "€1.24M", "+18.4%"],
              ["SQLs", "842", "+9.1%"],
              ["ROAS", "4.2x", "+10.5%"],
            ].map(([label, value, delta]) => (
              <div key={label} className="rounded-xl border border-border bg-surface-2/50 p-3">
                <p className="text-[11px] text-muted">{label}</p>
                <p className="mt-1 text-lg font-semibold">{value}</p>
                <p className="text-[11px] font-semibold text-success">{delta}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl border border-border bg-surface-2/50 p-3">
            <p className="flex items-center gap-1.5 text-[11px] text-muted"><TrendingUp className="size-3.5" /> Performance pulse</p>
            <Sparkline data={SPARK} height={90} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0, y: [0, -8, 0] }}
          transition={{ opacity: { delay: 0.7 }, x: { delay: 0.7, type: "spring" }, y: { duration: 5, repeat: Infinity, ease: "easeInOut" } }}
          className="glass absolute -right-6 -bottom-8 w-64 rounded-2xl p-4 shadow-2xl max-sm:hidden"
          style={{ translateZ: 60 }}
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold"><Sparkles className="size-3.5 text-accent" /> Ask Marketing</p>
          <p className="mt-2 text-[11px] text-muted">Why did qualified leads decline last week?</p>
          <p className="mt-2 text-[11px] leading-relaxed">Brand search hit its budget cap on Thursday. 81% of the drop is explained by two causes.</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0, y: [0, 8, 0] }}
          transition={{ opacity: { delay: 0.9 }, x: { delay: 0.9, type: "spring" }, y: { duration: 6, repeat: Infinity, ease: "easeInOut" } }}
          className="glass absolute -top-6 -left-8 flex items-center gap-2 rounded-xl px-3 py-2 text-xs shadow-xl max-sm:hidden"
          style={{ translateZ: 40 }}
        >
          <CircleCheck className="size-4 text-success" /> Approved · pause 3 ad sets · saves €1,840/wk
        </motion.div>
      </motion.div>
    </div>
  );
}
