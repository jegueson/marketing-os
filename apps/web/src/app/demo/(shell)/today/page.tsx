"use client";

import { AlertTriangle, CheckSquare, Clapperboard, FileText, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, type Tone } from "@/demo/components/ui/badges";
import { Card } from "@/demo/components/ui/card";
import { PageHeader } from "@/demo/components/ui/page-header";
import { Segmented } from "@/demo/components/ui/buttons";
import { Stagger, RevealItem } from "@/demo/components/ui/reveal";
import { ROLES, TODAY_BY_ROLE, TODAY_STATS, type DemoRole, type TodayItem } from "@/demo/data/today";

const KIND_ICON = {
  approval: ShieldCheck,
  alert: AlertTriangle,
  task: CheckSquare,
  brief: FileText,
  job: Clapperboard,
} as const;

const KIND_LABEL: Record<TodayItem["kind"], string> = {
  approval: "Approval",
  alert: "Alert",
  task: "Task",
  brief: "Brief",
  job: "Job",
};

export default function TodayPage() {
  const [role, setRole] = useState<DemoRole>("cmo");
  const roleMeta = ROLES.find((r) => r.id === role)!;
  const items = TODAY_BY_ROLE[role];
  const stats = TODAY_STATS[role];
  const options = useMemo(() => ROLES.map((r) => ({ id: r.id, label: r.label })), []);

  return (
    <>
      <PageHeader
        title="Today"
        subtitle="Your daily marketing workspace. Approvals, alerts, tasks and jobs — not another project board."
        actions={<Segmented options={options} value={role} onChange={setRole} label="Role" />}
      />
      <Stagger className="grid gap-4">
        <Card tour="today-queue" title={roleMeta.title} icon={<CheckSquare />} bodyClassName="grid gap-4 sm:grid-cols-3">
          {stats.map((s) => (
            <RevealItem key={s.label}>
              <p className="text-xs text-muted">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular">{s.value}</p>
            </RevealItem>
          ))}
        </Card>

        <Card title="My queue" icon={<ShieldCheck />} bodyClassName="grid gap-3">
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <RevealItem key={item.id}>
                <Link
                  href={item.href}
                  className="focus-ring glass flex items-start gap-3 rounded-xl border border-border/80 p-3 transition hover:border-accent/40"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-accent">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone={item.tone as Tone}>{KIND_LABEL[item.kind]}</Badge>
                      <span className="text-xs text-muted">{item.age}</span>
                    </span>
                    <span className="mt-1 block text-sm font-medium">{item.title}</span>
                    <span className="block text-xs text-muted">{item.detail}</span>
                  </span>
                </Link>
              </RevealItem>
            );
          })}
        </Card>
      </Stagger>
    </>
  );
}
