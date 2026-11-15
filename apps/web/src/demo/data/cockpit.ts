import type { ValueKind } from "@/demo/lib/format";
import { makeSeries, shortDate } from "@/demo/lib/series";
import type { Tone } from "@/demo/components/ui/badges";

export type Kpi = {
  id: string;
  label: string;
  value: number;
  previous: number;
  target: number;
  kind: ValueKind;
  goodWhenUp: boolean;
  source: string;
  freshness: string;
  spark: number[];
};

function spark(seed: number, start: number, end: number): number[] {
  return makeSeries({ points: 20, start, end, noise: 0.06, seed }).map((p) => p.value);
}

function delta(kpi: Pick<Kpi, "value" | "previous">): number {
  return ((kpi.value - kpi.previous) / kpi.previous) * 100;
}

export const KPIS: readonly Kpi[] = [
  { id: "pipeline", label: "Marketing pipeline", value: 1_240_000, previous: 1_047_000, target: 1_200_000, kind: "eur", goodWhenUp: true, source: "HubSpot", freshness: "4 min", spark: spark(1, 0.8, 1.24) },
  { id: "sql", label: "Qualified leads (SQL)", value: 842, previous: 772, target: 900, kind: "number", goodWhenUp: true, source: "HubSpot", freshness: "4 min", spark: spark(2, 700, 842) },
  { id: "cac", label: "Blended CAC", value: 212, previous: 226, target: 220, kind: "eur", goodWhenUp: false, source: "Ads + HubSpot", freshness: "12 min", spark: spark(3, 240, 212) },
  { id: "roas", label: "Paid ROAS", value: 4.2, previous: 3.8, target: 4, kind: "ratio", goodWhenUp: true, source: "Google + Meta Ads", freshness: "12 min", spark: spark(4, 3.4, 4.2) },
];

export function kpiDelta(kpi: Kpi): number {
  return delta(kpi);
}

const current = makeSeries({ points: 30, start: 31_000, end: 48_500, noise: 0.06, weekly: 0.12, seed: 11 });
const previous = makeSeries({ points: 30, start: 27_000, end: 36_000, noise: 0.06, weekly: 0.12, seed: 12 });

export const PIPELINE_PULSE = current.map((point, i) => ({
  label: shortDate(point.date),
  current: point.value,
  previous: previous[i]?.value,
}));

export type Attention = {
  id: string;
  tone: Tone;
  kind: "Anomaly" | "Risk" | "Data issue" | "Opportunity";
  title: string;
  detail: string;
  age: string;
};

export const ATTENTION: readonly Attention[] = [
  { id: "a1", tone: "danger", kind: "Anomaly", title: "Meta Ads CPA up 32% in 3 days", detail: "Retargeting ad sets · frequency 7.4", age: "18 min" },
  { id: "a2", tone: "warning", kind: "Data issue", title: "GA4 sync delayed 2h 10m", detail: "Freshness on 3 KPIs affected", age: "2 h" },
  { id: "a3", tone: "warning", kind: "Risk", title: "/pricing conversion down 21%", detail: "Since the Nov 4 page release", age: "6 h" },
  { id: "a4", tone: "primary", kind: "Opportunity", title: "'workflow automation' rank 4 to 2", detail: "Search Console · +3.1K clicks/mo potential", age: "1 d" },
];

export type Recommendation = {
  id: string;
  title: string;
  problem: string;
  impact: string;
  confidence: "High" | "Medium";
  effort: "Low" | "Medium";
  owner: string;
};

export const RECOMMENDATIONS: readonly Recommendation[] = [
  { id: "r1", title: "Shift €18K from Meta retargeting to Google Search", problem: "Retargeting CPA €184 vs €96 on brand search", impact: "+€64K pipeline / month", confidence: "High", effort: "Low", owner: "Paid Media Analyst" },
  { id: "r2", title: "Restore the old /pricing hero and test a new CTA", problem: "Conversion fell 21% after the Nov 4 release", impact: "+38 SQL / month", confidence: "Medium", effort: "Medium", owner: "CRO Agent" },
  { id: "r3", title: "Brief a pillar page for 'workflow automation'", problem: "Rank 2 within reach; no dedicated page", impact: "+3.1K organic clicks / month", confidence: "High", effort: "Medium", owner: "SEO Strategist" },
];

export const CHANNEL_MIX = [
  { name: "Paid search", value: 412_000 },
  { name: "Paid social", value: 286_000 },
  { name: "Organic", value: 248_000 },
  { name: "Email", value: 162_000 },
  { name: "Events", value: 84_000 },
  { name: "Referral", value: 48_000 },
] as const;

export type AgentEvent = { id: string; agent: string; action: string; time: string; status: "done" | "waiting" | "running" };

export const AGENT_ACTIVITY: readonly AgentEvent[] = [
  { id: "e1", agent: "Paid Media Analyst", action: "Flagged 3 Meta ad sets with ROAS below 1.0", time: "10:24", status: "waiting" },
  { id: "e2", agent: "Reporting Agent", action: "Sent the weekly CMO brief to 6 people", time: "09:00", status: "done" },
  { id: "e3", agent: "Lead Scoring Agent", action: "Re-scored 1,284 HubSpot contacts", time: "08:41", status: "done" },
  { id: "e4", agent: "SEO Strategist", action: "Crawling 412 pages for technical issues", time: "now", status: "running" },
];
