import type { Kpi } from "./cockpit";
import { makeSeries, shortDate } from "@/demo/lib/series";

function spark(seed: number, start: number, end: number): number[] {
  return makeSeries({ points: 20, start, end, noise: 0.05, seed }).map((p) => p.value);
}

/* ---------- Performance ---------- */

export const PERFORMANCE_KPIS: readonly Kpi[] = [
  { id: "spend", label: "Paid spend", value: 148_600, previous: 141_200, target: 150_000, kind: "eur", goodWhenUp: true, source: "Google · Meta · LinkedIn", freshness: "12 min", spark: spark(21, 130_000, 148_600) },
  { id: "cpsql", label: "Cost per SQL", value: 138, previous: 151, target: 140, kind: "eur", goodWhenUp: false, source: "Ads + HubSpot", freshness: "12 min", spark: spark(22, 160, 138) },
  { id: "ctr", label: "Click-through rate", value: 2.8, previous: 2.5, target: 2.6, kind: "percent", goodWhenUp: true, source: "Ad platforms", freshness: "12 min", spark: spark(23, 2.3, 2.8) },
  { id: "roas", label: "Pipeline ROAS", value: 4.2, previous: 3.8, target: 4, kind: "ratio", goodWhenUp: true, source: "Ads + HubSpot", freshness: "12 min", spark: spark(24, 3.4, 4.2) },
];

export const SPEND_VS_ROAS = [
  { label: "Search", bar: 62_400, line: 5.8 },
  { label: "Social", bar: 41_800, line: 2.9 },
  { label: "LinkedIn", bar: 24_100, line: 3.6 },
  { label: "Display", bar: 11_300, line: 1.4 },
  { label: "Video", bar: 9_000, line: 2.1 },
] as const;

export const FUNNEL = [
  { stage: "Impressions", value: 4_820_000 },
  { stage: "Clicks", value: 134_900 },
  { stage: "Leads", value: 6_120 },
  { stage: "MQL", value: 2_310 },
  { stage: "SQL", value: 842 },
  { stage: "Opportunities", value: 296 },
] as const;

export type Campaign = {
  name: string;
  channel: string;
  spend: number;
  sql: number;
  cpsql: number;
  roas: number;
  status: "Scaling" | "Healthy" | "Watch" | "Underperforming";
};

export const CAMPAIGNS: readonly Campaign[] = [
  { name: "Brand · Exact", channel: "Google Ads", spend: 18_200, sql: 190, cpsql: 96, roas: 9.4, status: "Scaling" },
  { name: "Webinar · Ops leaders", channel: "LinkedIn Ads", spend: 8_400, sql: 95, cpsql: 88, roas: 6.1, status: "Scaling" },
  { name: "Competitor comparison", channel: "Google Ads", spend: 14_600, sql: 112, cpsql: 130, roas: 4.4, status: "Healthy" },
  { name: "Case study carousel", channel: "Meta Ads", spend: 11_900, sql: 84, cpsql: 142, roas: 3.5, status: "Watch" },
  { name: "Generic 'automation'", channel: "Google Ads", spend: 4_300, sql: 27, cpsql: 162, roas: 2.4, status: "Watch" },
  { name: "Lookalike 3%", channel: "Meta Ads", spend: 5_100, sql: 30, cpsql: 171, roas: 1.9, status: "Underperforming" },
  { name: "Retargeting · all visitors", channel: "Meta Ads", spend: 9_200, sql: 50, cpsql: 184, roas: 0.9, status: "Underperforming" },
];

/* ---------- Organic ---------- */

export const ORGANIC_KPIS: readonly Kpi[] = [
  { id: "sessions", label: "Organic sessions", value: 84_300, previous: 69_800, target: 80_000, kind: "number", goodWhenUp: true, source: "GA4", freshness: "2 h", spark: spark(31, 62_000, 84_300) },
  { id: "nonbrand", label: "Non-brand clicks", value: 23_100, previous: 18_200, target: 22_000, kind: "number", goodWhenUp: true, source: "Search Console", freshness: "6 h", spark: spark(32, 17_000, 23_100) },
  { id: "position", label: "Avg. position (top 50 kw)", value: 7.4, previous: 8.9, target: 7, kind: "decimal", goodWhenUp: false, source: "Search Console", freshness: "6 h", spark: spark(33, 9.4, 7.4) },
  { id: "orgsql", label: "Organic SQLs", value: 214, previous: 176, target: 200, kind: "number", goodWhenUp: true, source: "HubSpot", freshness: "4 min", spark: spark(34, 160, 214) },
];

const organicPrior = makeSeries({ points: 90, start: 1_900, end: 2_250, noise: 0.07, weekly: 0.3, seed: 42 });

export const ORGANIC_TRAFFIC = makeSeries({ points: 90, start: 2_050, end: 2_980, noise: 0.07, weekly: 0.3, seed: 41 }).map((p, i) => ({
  label: shortDate(p.date),
  current: p.value,
  previous: organicPrior[i]?.value,
}));

export type Keyword = { keyword: string; position: number; change: number; volume: number; intent: "Commercial" | "Informational" | "Navigational" };

export const KEYWORDS: readonly Keyword[] = [
  { keyword: "workflow automation software", position: 2, change: 2, volume: 18_100, intent: "Commercial" },
  { keyword: "acme cloud", position: 1, change: 0, volume: 9_900, intent: "Navigational" },
  { keyword: "zapier alternative", position: 4, change: 3, volume: 6_600, intent: "Commercial" },
  { keyword: "approval workflow template", position: 3, change: 5, volume: 4_400, intent: "Informational" },
  { keyword: "no-code ops automation", position: 6, change: -1, volume: 2_900, intent: "Commercial" },
  { keyword: "what is process automation", position: 9, change: -3, volume: 12_100, intent: "Informational" },
];

export const TECH_HEALTH = {
  score: 86,
  issues: [
    { label: "Pages with slow LCP (> 2.5 s)", count: 14, tone: "warning" as const },
    { label: "Broken internal links", count: 6, tone: "danger" as const },
    { label: "Missing meta descriptions", count: 22, tone: "warning" as const },
    { label: "Pages indexed", count: 412, tone: "success" as const },
  ],
};

export const CONTENT_OPPORTUNITIES = [
  { title: "Pillar page: workflow automation", impact: "+3.1K clicks / mo", difficulty: "Medium" },
  { title: "Refresh: 'what is process automation'", impact: "+1.8K clicks / mo", difficulty: "Low" },
  { title: "Template gallery hub", impact: "+1.2K clicks / mo", difficulty: "Medium" },
] as const;

/* ---------- Retention ---------- */

export const RETENTION_KPIS: readonly Kpi[] = [
  { id: "nrr", label: "Net revenue retention", value: 118, previous: 114, target: 115, kind: "percent", goodWhenUp: true, source: "HubSpot", freshness: "4 min", spark: spark(51, 110, 118) },
  { id: "churn", label: "Logo churn (monthly)", value: 1.6, previous: 1.9, target: 1.8, kind: "percent", goodWhenUp: false, source: "HubSpot", freshness: "4 min", spark: spark(52, 2.1, 1.6) },
  { id: "activation", label: "Trial activation", value: 41, previous: 37, target: 40, kind: "percent", goodWhenUp: true, source: "Product events", freshness: "1 h", spark: spark(53, 34, 41) },
  { id: "expansion", label: "Expansion pipeline", value: 312_000, previous: 268_000, target: 300_000, kind: "eur", goodWhenUp: true, source: "HubSpot", freshness: "4 min", spark: spark(54, 240_000, 312_000) },
];

/** Logo retention % by signup cohort (rows) and months since signup (columns). */
export const COHORTS: readonly { cohort: string; values: readonly number[] }[] = [
  { cohort: "Apr", values: [100, 92, 88, 85, 83, 82, 81] },
  { cohort: "May", values: [100, 93, 89, 87, 85, 84] },
  { cohort: "Jun", values: [100, 91, 87, 85, 84] },
  { cohort: "Jul", values: [100, 94, 91, 89] },
  { cohort: "Aug", values: [100, 95, 92] },
  { cohort: "Sep", values: [100, 96] },
  { cohort: "Oct", values: [100] },
];

export const LIFECYCLE = [
  { program: "Trial onboarding (7 emails)", sent: 18_420, open: 58, click: 14, conversion: 9.2 },
  { program: "Activation nudges", sent: 9_310, open: 51, click: 11, conversion: 6.4 },
  { program: "Expansion · seats", sent: 3_880, open: 46, click: 9, conversion: 4.1 },
  { program: "Win-back · churned", sent: 2_140, open: 31, click: 4, conversion: 1.3 },
] as const;

export const CHURN_RISK = [
  { segment: "Low usage, 1 seat", accounts: 64, risk: 72 },
  { segment: "No admin login 30 d", accounts: 38, risk: 58 },
  { segment: "Support tickets > 5", accounts: 21, risk: 44 },
  { segment: "Healthy", accounts: 1_204, risk: 6 },
] as const;
