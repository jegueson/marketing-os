"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";
import { revealItem } from "./reveal";

type CardProps = HTMLMotionProps<"section"> & {
  title?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  tour?: string;
  bodyClassName?: string;
};

/** Glass panel used by every screen. Animates in as part of a <Stagger> group. */
export function Card({ title, icon, action, tour, className = "", bodyClassName = "", children, ...rest }: CardProps) {
  return (
    <motion.section
      variants={revealItem}
      data-tour={tour}
      className={`glass relative flex flex-col rounded-2xl shadow-[0_1px_0_0_rgb(255_255_255/0.04)_inset] ${className}`}
      {...rest}
    >
      {title ? (
        <header className="flex items-center justify-between gap-3 px-5 pt-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {icon ? <span aria-hidden="true" className="text-accent [&>svg]:size-4">{icon}</span> : null}
            {title}
          </h2>
          {action}
        </header>
      ) : null}
      <div className={`flex-1 p-5 ${title ? "pt-3" : ""} ${bodyClassName}`}>{children as ReactNode}</div>
    </motion.section>
  );
}
