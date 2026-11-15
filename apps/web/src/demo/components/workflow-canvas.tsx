"use client";

import { motion } from "motion/react";
import { Bot, CalendarClock, Check, FileClock, Loader2, Megaphone, ShieldCheck, UserCheck, type LucideIcon } from "lucide-react";
import { FLOW_EDGES, FLOW_NODES, type FlowNode } from "@/demo/data/operate";

const ICONS: Record<FlowNode["kind"], LucideIcon> = {
  trigger: CalendarClock,
  agent: Bot,
  policy: ShieldCheck,
  approval: UserCheck,
  action: Megaphone,
  log: FileClock,
};

export type NodeState = "idle" | "running" | "done" | "waiting";

type Props = { states: Readonly<Record<string, NodeState>> };

function byId(id: string): FlowNode {
  const node = FLOW_NODES.find((n) => n.id === id);
  if (!node) throw new Error(`Unknown flow node: ${id}`);
  return node;
}

/**
 * Nodes are HTML positioned in percent; edges are an SVG stretched to the same box.
 * `non-scaling-stroke` keeps line width constant while the SVG stretches.
 */
export function WorkflowCanvas({ states }: Props) {
  return (
    <div
      className="relative h-[380px] min-w-[760px] rounded-xl border border-border"
      style={{ backgroundImage: "radial-gradient(var(--mos-grid) 1.2px, transparent 1.2px)", backgroundSize: "18px 18px" }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden="true">
        {FLOW_EDGES.map(([from, to]) => {
          const a = byId(from);
          const b = byId(to);
          const live = states[from] === "done" && states[to] !== "idle";
          const mid = (a.x + b.x) / 2;
          const d = `M ${a.x} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}`;
          return (
            <g key={`${from}-${to}`}>
              <path d={d} fill="none" stroke="var(--mos-border)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              <path
                d={d}
                fill="none"
                stroke="var(--mos-accent)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                className={live ? "flow-line" : ""}
                style={{ opacity: live ? 1 : 0.25, transition: "opacity 400ms" }}
              />
            </g>
          );
        })}
      </svg>

      {FLOW_NODES.map((node, i) => {
        const state = states[node.id] ?? "idle";
        const Icon = ICONS[node.kind];
        return (
          <motion.div
            key={node.id}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: state === "running" ? 1.05 : 1 }}
            transition={{ delay: i * 0.08, type: "spring", stiffness: 300, damping: 22 }}
            className="absolute w-[150px] -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${node.x}%`, top: `${node.y}%` }}
          >
            <div
              className={`glass rounded-xl p-3 transition-shadow duration-300 ${state === "running" ? "glow-ring" : ""} ${state === "waiting" ? "ring-2 ring-warning/60" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className={`grid size-7 place-items-center rounded-lg ${node.kind === "approval" ? "bg-warning/15 text-warning" : "bg-primary/15 text-accent"}`}>
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <span className="ml-auto">
                  {state === "done" ? <Check aria-label="done" className="size-4 text-success" /> : null}
                  {state === "running" ? <Loader2 aria-label="running" className="size-4 animate-spin text-accent motion-reduce:animate-none" /> : null}
                  {state === "waiting" ? <span className="text-[10px] font-semibold text-warning">WAITING</span> : null}
                </span>
              </div>
              <p className="mt-2 text-xs font-semibold">{node.title}</p>
              <p className="text-[11px] text-muted">{node.detail}</p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
