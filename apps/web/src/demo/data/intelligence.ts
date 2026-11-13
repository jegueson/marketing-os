/** Market intelligence — competitor tracking for the investor demo. */

export type Competitor = {
  id: string;
  name: string;
  category: string;
  domain: string;
  shareOfVoice: number;
  adSpendIndex: number;
  sentiment: number;
  change: string;
};

export const COMPETITORS: readonly Competitor[] = [
  { id: "co1", name: "Flowly", category: "Workflow SaaS", domain: "flowly.io", shareOfVoice: 28, adSpendIndex: 112, sentiment: 62, change: "+3 pts SOV" },
  { id: "co2", name: "Orbit Desk", category: "Ops suite", domain: "orbitdesk.com", shareOfVoice: 19, adSpendIndex: 88, sentiment: 54, change: "New EU pricing" },
  { id: "co3", name: "Pulseboard", category: "Analytics", domain: "pulseboard.ai", shareOfVoice: 14, adSpendIndex: 71, sentiment: 58, change: "Hiring surge" },
  { id: "co4", name: "Acme Cloud", category: "You", domain: "acme.cloud", shareOfVoice: 22, adSpendIndex: 100, sentiment: 71, change: "Baseline" },
];

export const SOV_SERIES = [
  { label: "W1", acme: 20, flowly: 25, orbit: 18, pulse: 12 },
  { label: "W2", acme: 21, flowly: 26, orbit: 18, pulse: 13 },
  { label: "W3", acme: 21, flowly: 27, orbit: 19, pulse: 13 },
  { label: "W4", acme: 22, flowly: 28, orbit: 19, pulse: 14 },
] as const;

export type TimelineEvent = {
  id: string;
  competitor: string;
  kind: "Website" | "Ads" | "Reviews" | "SEO" | "Hiring";
  title: string;
  detail: string;
  when: string;
};

export const WHAT_CHANGED: readonly TimelineEvent[] = [
  { id: "w1", competitor: "Orbit Desk", kind: "Website", title: "Published /pricing-eu", detail: "Euro pricing table + annual discount callout", when: "Yesterday" },
  { id: "w2", competitor: "Flowly", kind: "Ads", title: "12 new Meta ads on 'AI workflows'", detail: "Creative angle: time saved for ops teams", when: "2 days ago" },
  { id: "w3", competitor: "Pulseboard", kind: "Reviews", title: "G2 theme: 'slow support'", detail: "14 new reviews · sentiment −6 pts", when: "3 days ago" },
  { id: "w4", competitor: "Flowly", kind: "SEO", title: "Ranked #2 for 'workflow automation'", detail: "Acme still #4 · opportunity brief ready", when: "4 days ago" },
  { id: "w5", competitor: "Orbit Desk", kind: "Hiring", title: "Opened 3 EU marketing roles", detail: "Paid + content · LinkedIn jobs", when: "1 week ago" },
];

export type AdSnapshot = {
  id: string;
  competitor: string;
  platform: string;
  hook: string;
  runningDays: number;
  estimatedReach: string;
};

export const AD_SNAPSHOTS: readonly AdSnapshot[] = [
  { id: "ad1", competitor: "Flowly", platform: "Meta", hook: "Stop copy-pasting between five tools", runningDays: 18, estimatedReach: "240K" },
  { id: "ad2", competitor: "Orbit Desk", platform: "LinkedIn", hook: "EU-ready ops in one workspace", runningDays: 9, estimatedReach: "86K" },
  { id: "ad3", competitor: "Pulseboard", platform: "YouTube", hook: "Dashboards that answer 'why'", runningDays: 27, estimatedReach: "410K" },
  { id: "ad4", competitor: "Flowly", platform: "Google", hook: "Workflow automation software", runningDays: 41, estimatedReach: "—" },
];

export const REVIEW_THEMES = [
  { theme: "Time to value", you: 78, competitorAvg: 61 },
  { theme: "Integrations", you: 72, competitorAvg: 68 },
  { theme: "Pricing clarity", you: 54, competitorAvg: 63 },
  { theme: "Support speed", you: 66, competitorAvg: 58 },
] as const;
