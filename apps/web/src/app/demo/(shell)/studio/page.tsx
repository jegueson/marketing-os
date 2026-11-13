"use client";

import { Clapperboard, Loader2, Send, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, type Tone } from "@/demo/components/ui/badges";
import { DemoButton } from "@/demo/components/ui/buttons";
import { Card } from "@/demo/components/ui/card";
import { PageHeader } from "@/demo/components/ui/page-header";
import { Stagger } from "@/demo/components/ui/reveal";
import { useToast } from "@/demo/components/toast";
import { ASSETS, BRIEFS, STUDIO_TOOLS, VARIANT_LABELS } from "@/demo/data/studio";
import { advanceGenerationJob, INITIAL_GENERATION_JOB } from "@/demo/lib/generation-job";

const STEP_MS = 700;

const STATUS_TONE: Record<string, Tone> = {
  Draft: "neutral",
  Ready: "primary",
  "In generation": "violet",
  "In approval": "warning",
  "Brand check": "warning",
  Approved: "success",
  Published: "success",
  Connected: "success",
  "Self-hosted": "primary",
};

function statusTone(status: string): Tone {
  return STATUS_TONE[status] ?? "neutral";
}

export default function StudioPage() {
  const [briefId, setBriefId] = useState(BRIEFS[0]?.id ?? "");
  const [job, setJob] = useState(INITIAL_GENERATION_JOB);
  const [running, setRunning] = useState(false);
  const timers = useRef<number[]>([]);
  const notify = useToast();
  const brief = BRIEFS.find((b) => b.id === briefId) ?? BRIEFS[0];

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  function selectBrief(id: string) {
    if (running) return;
    timers.current.forEach((t) => window.clearTimeout(t));
    setBriefId(id);
    setJob(INITIAL_GENERATION_JOB);
  }

  function generate() {
    if (!brief) return;
    timers.current.forEach((t) => window.clearTimeout(t));
    setRunning(true);
    setJob(INITIAL_GENERATION_JOB);
    let state = INITIAL_GENERATION_JOB;
    for (let i = 0; i < 4; i++) {
      timers.current.push(
        window.setTimeout(() => {
          state = advanceGenerationJob(state);
          setJob({ ...state });
          if (state.phase === "ready") {
            setRunning(false);
            notify({ tone: "success", title: "Variants ready", body: "Brand check passed on 4 cuts. Send one to approval." });
          }
        }, (i + 1) * STEP_MS),
      );
    }
  }

  function sendToApproval(label: string) {
    notify({ tone: "warning", title: "Sent to Approvals", body: `${label} is waiting for brand lead.` });
  }

  return (
    <>
      <PageHeader
        title="Creative studio"
        subtitle="Brief → generate with Runway, Higgsfield or ComfyUI → brand check → approval → publish. Bring your own keys."
      />
      <Stagger className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {STUDIO_TOOLS.map((t) => (
            <Card key={t.name} bodyClassName="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-violet/15 text-violet">
                <Wand2 aria-hidden="true" className="size-5" />
              </span>
              <span>
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {t.name}
                  <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                </span>
                <span className="block text-xs text-muted">{t.detail}</span>
              </span>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-5">
          <Card className="xl:col-span-2" title="Briefs" icon={<Clapperboard />} bodyClassName="space-y-2">
            {BRIEFS.map((b) => (
              <button
                key={b.id}
                type="button"
                aria-pressed={briefId === b.id}
                onClick={() => selectBrief(b.id)}
                className={`focus-ring w-full rounded-xl border p-3 text-left transition ${briefId === b.id ? "glow-ring border-primary/40 bg-primary/10" : "border-border bg-surface-2/40 hover:border-accent/40"}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{b.title}</span>
                  <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                </span>
                <span className="mt-1 block text-xs text-muted">{b.channel} · {b.owner}</span>
              </button>
            ))}
          </Card>

          <Card
            className="xl:col-span-3"
            tour="studio-generate"
            title="Generate"
            icon={<Sparkles />}
            action={
              <DemoButton variant="primary" icon={running ? <Loader2 className="animate-spin" /> : <Wand2 />} onClick={generate} disabled={running || !brief || brief.status === "Draft"}>
                {running ? "Generating…" : "Generate with Runway"}
              </DemoButton>
            }
          >
            <p className="text-sm text-muted text-pretty">{brief?.objective ?? "No brief selected."}</p>
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-muted" aria-live="polite">
                <span className="capitalize">{job.phase.replace("_", " ")}</span>
                <span className="tabular">{job.progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted/15" role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Generation progress">
                <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${job.progress}%` }} />
              </div>
            </div>

            {job.phase === "ready" ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {VARIANT_LABELS.map((label) => (
                  <div key={label} className="rounded-xl border border-border bg-surface-2/50 p-3">
                    <div className="mb-3 aspect-video rounded-lg bg-gradient-to-br from-primary/30 via-violet/20 to-surface-2" />
                    <p className="text-sm font-medium">{label}</p>
                    <DemoButton
                      className="mt-2 w-full"
                      variant="secondary"
                      icon={<Send />}
                      aria-label={`Send ${label} to approval`}
                      onClick={() => sendToApproval(label)}
                    >
                      Send to approval
                    </DemoButton>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-xs text-muted">Pick a ready brief, then generate. Variants appear after brand check.</p>
            )}
          </Card>
        </div>

        <Card title="Asset library" icon={<Clapperboard />} bodyClassName="px-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="px-5 py-2.5 font-medium">Asset</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Tool</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Format</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Brand score</th>
                </tr>
              </thead>
              <tbody>
                {ASSETS.map((a) => (
                  <tr key={a.id} className="border-b border-border/60 last:border-0 hover:bg-surface-2/40">
                    <td className="px-5 py-3 font-medium">{a.title}</td>
                    <td className="px-3 py-3 text-muted">{a.tool}</td>
                    <td className="px-3 py-3 text-muted">{a.format}</td>
                    <td className="px-3 py-3"><Badge tone={statusTone(a.status)}>{a.status}</Badge></td>
                    <td className="px-5 py-3 font-semibold tabular">{a.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Stagger>
    </>
  );
}
