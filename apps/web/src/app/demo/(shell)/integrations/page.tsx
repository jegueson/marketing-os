"use client";

import { AnimatePresence, motion } from "motion/react";
import { Activity, Cable, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { ConnectorMark } from "@/demo/components/connector-tile";
import { Badge, StatusDot, type Tone } from "@/demo/components/ui/badges";
import { DemoButton } from "@/demo/components/ui/buttons";
import { Card } from "@/demo/components/ui/card";
import { PageHeader } from "@/demo/components/ui/page-header";
import { Stagger } from "@/demo/components/ui/reveal";
import { useToast } from "@/demo/components/toast";
import { connector } from "@/demo/data/company";
import { CONNECTIONS, type Connection, type ConnectionStatus } from "@/demo/data/operate";

type LiveStatus = ConnectionStatus | "syncing" | "connecting";

const STATUS: Record<LiveStatus, { label: string; tone: Tone }> = {
  healthy: { label: "Healthy", tone: "success" },
  delayed: { label: "Delayed", tone: "warning" },
  error: { label: "Needs reconnect", tone: "danger" },
  available: { label: "Not connected", tone: "neutral" },
  syncing: { label: "Syncing", tone: "primary" },
  connecting: { label: "Authorizing", tone: "primary" },
};

const SYNC_MS = 2200;

export default function IntegrationsPage() {
  const [live, setLive] = useState<Record<string, LiveStatus>>(Object.fromEntries(CONNECTIONS.map((c) => [c.connectorId, c.status])));
  const notify = useToast();
  const healthy = Object.values(live).filter((s) => s === "healthy").length;
  const connected = Object.values(live).filter((s) => s !== "available").length;

  function act(c: Connection) {
    const current = live[c.connectorId];
    const name = connector(c.connectorId).name;
    setLive((l) => ({ ...l, [c.connectorId]: current === "available" || current === "error" ? "connecting" : "syncing" }));
    window.setTimeout(() => setLive((l) => ({ ...l, [c.connectorId]: "syncing" })), SYNC_MS / 2);
    window.setTimeout(() => {
      setLive((l) => ({ ...l, [c.connectorId]: "healthy" }));
      notify({ tone: "success", title: `${name} is healthy`, body: "Read-only scopes granted. First sync complete." });
    }, SYNC_MS);
  }

  return (
    <>
      <PageHeader
        title="Integrations & data health"
        subtitle="Read-only by default. Each source shows freshness, scope and sync state."
        actions={<DemoButton variant="primary" icon={<Plus />}>Add source</DemoButton>}
      />
      <Stagger className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card bodyClassName="flex items-center justify-between"><span className="text-sm text-muted">Connected sources</span><span className="text-2xl font-semibold tabular">{connected}</span></Card>
          <Card bodyClassName="flex items-center justify-between"><span className="text-sm text-muted">Healthy</span><span className="text-2xl font-semibold text-success tabular">{healthy}</span></Card>
          <Card bodyClassName="flex items-center justify-between"><span className="text-sm text-muted">Records synced (30 d)</span><span className="text-2xl font-semibold tabular">1.56M</span></Card>
        </div>

        <Card tour="integrations-grid" title="Sources" icon={<Cable />}>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {CONNECTIONS.map((c) => {
              const meta = connector(c.connectorId);
              const status = live[c.connectorId] ?? c.status;
              const busy = status === "syncing" || status === "connecting";
              const s = STATUS[status];
              return (
                <motion.li key={c.connectorId} layout whileHover={{ y: -3 }} className="relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface-2/40 p-4">
                  <div className="flex items-center gap-3">
                    <ConnectorMark connector={meta} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{meta.name}</span>
                      <span className="block text-xs text-muted">{meta.category}</span>
                    </span>
                  </div>
                  <p className="mt-3 flex items-center gap-2 text-xs">
                    <StatusDot tone={s.tone} pulse={busy} />
                    <span className="font-medium">{s.label}</span>
                  </p>
                  <p className="mt-1 min-h-8 text-[11px] text-muted">{c.note ?? (status === "available" ? "OAuth · read-only scopes" : `${c.records} · ${c.scopes}`)}</p>
                  <DemoButton className="mt-3 w-full" variant={status === "available" || status === "error" ? "primary" : "secondary"} icon={<RefreshCw className={busy ? "animate-spin" : ""} />} disabled={busy} onClick={() => act(c)}>
                    {status === "available" ? "Connect" : status === "error" ? "Reconnect" : busy ? "Working…" : "Sync now"}
                  </DemoButton>
                  <AnimatePresence>
                    {busy ? (
                      <motion.span key="bar" className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} exit={{ opacity: 0 }} transition={{ duration: SYNC_MS / 1000, ease: "easeInOut" }} />
                    ) : null}
                  </AnimatePresence>
                </motion.li>
              );
            })}
          </ul>
        </Card>

        <Card title="Data health" icon={<Activity />} bodyClassName="px-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="px-5 py-2.5 font-medium">Source</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Last sync</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Records</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Scope</th>
                </tr>
              </thead>
              <tbody>
                {CONNECTIONS.filter((c) => (live[c.connectorId] ?? c.status) !== "available").map((c) => {
                  const s = STATUS[live[c.connectorId] ?? c.status];
                  return (
                    <tr key={c.connectorId} className="border-b border-border/60 last:border-0 hover:bg-surface-2/40">
                      <td className="px-5 py-3 font-medium">{connector(c.connectorId).name}</td>
                      <td className="px-3 py-3"><Badge tone={s.tone}>{s.label}</Badge></td>
                      <td className="px-3 py-3 text-muted">{live[c.connectorId] === "healthy" && c.status !== "healthy" ? "just now" : c.lastSync}</td>
                      <td className="px-3 py-3 text-muted tabular">{c.records}</td>
                      <td className="px-5 py-3 text-muted">{c.scopes}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </Stagger>
    </>
  );
}
