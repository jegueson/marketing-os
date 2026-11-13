import type { Autonomy } from "./operate";

export type Skill = { id: string; name: string; area: string; version: string; evalScore: number; uses: number; author: string };

export const SKILLS: readonly Skill[] = [
  { id: "s1", name: "Paid media waste finder", area: "Performance", version: "v3.2", evalScore: 94, uses: 412, author: "Expert Services" },
  { id: "s2", name: "Weekly CMO brief", area: "Reporting", version: "v5.0", evalScore: 97, uses: 188, author: "Core" },
  { id: "s3", name: "Lead quality diagnosis", area: "Leads", version: "v2.1", evalScore: 89, uses: 233, author: "Core" },
  { id: "s4", name: "SEO content brief", area: "Organic", version: "v1.4", evalScore: 91, uses: 96, author: "Community" },
  { id: "s5", name: "Brand voice checker", area: "Brand", version: "v2.0", evalScore: 93, uses: 141, author: "Expert Services" },
  { id: "s6", name: "Churn-risk segmenter", area: "Retention", version: "v1.1", evalScore: 86, uses: 54, author: "Community" },
];

export type Agent = { id: string; name: string; purpose: string; skills: number; autonomy: Autonomy; model: string };

export const AGENTS: readonly Agent[] = [
  { id: "g1", name: "Paid Media Analyst", purpose: "Finds wasted spend and proposes budget moves", skills: 4, autonomy: "Act with approval", model: "OpenRouter · claude-sonnet" },
  { id: "g2", name: "Reporting Agent", purpose: "Writes the weekly CMO brief", skills: 2, autonomy: "Act", model: "OpenRouter · gpt-mini" },
  { id: "g3", name: "SEO Strategist", purpose: "Technical crawl and content opportunities", skills: 3, autonomy: "Suggest", model: "OpenRouter · claude-sonnet" },
  { id: "g4", name: "Monitoring Agent", purpose: "Watches KPIs for anomalies every 30 min", skills: 1, autonomy: "Observe", model: "Self-hosted · llama" },
];

export const AUTONOMY_LEVELS: readonly { id: Autonomy; label: string }[] = [
  { id: "Observe", label: "Observe" },
  { id: "Suggest", label: "Suggest" },
  { id: "Act with approval", label: "Approve" },
  { id: "Act", label: "Act" },
];

export type PromptVersion = { version: string; date: string; evalScore: number; note: string; live: boolean };

export const PROMPTS: readonly { id: string; name: string; versions: readonly PromptVersion[] }[] = [
  {
    id: "p1",
    name: "cmo_brief.summary",
    versions: [
      { version: "v5.0", date: "Nov 3", evalScore: 97, note: "Lead with change vs target, cap at 120 words", live: true },
      { version: "v4.2", date: "Oct 14", evalScore: 92, note: "Added freshness disclaimer", live: false },
      { version: "v4.0", date: "Sep 22", evalScore: 88, note: "Initial structured template", live: false },
    ],
  },
  {
    id: "p2",
    name: "paid_media.waste_reasoning",
    versions: [
      { version: "v3.2", date: "Nov 6", evalScore: 94, note: "Require two evidence points per pause", live: true },
      { version: "v3.1", date: "Oct 28", evalScore: 90, note: "Use cost_per_sql v2 definition", live: false },
    ],
  },
];

export const CUSTOMERS = [
  { name: "Acme Cloud", plan: "Cloud · Growth", sources: 8, automations: 12, credits: 1_840, health: "Healthy" },
  { name: "Northwind Labs", plan: "Self-hosted + Expert", sources: 6, automations: 7, credits: 0, health: "Healthy" },
  { name: "Lumen Health", plan: "Cloud · Starter", sources: 4, automations: 3, credits: 620, health: "Onboarding" },
  { name: "Helix Robotics", plan: "Enterprise", sources: 11, automations: 19, credits: 4_210, health: "Attention" },
] as const;
