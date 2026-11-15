"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <motion.div
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
      >
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </motion.div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
