/* ---------- Automations ---------- */

export type Autonomy = "Observe" | "Suggest" | "Act with approval" | "Act";

export type Automation = {
  id: string;
  name: string;
  schedule: string;
  agent: string;
  autonomy: Autonomy;
  enabled: boolean;
  runs: number;
  success: number;
  hoursSaved: number;
};

export const AUTOMATIONS: readonly Automation[] = [
  { id: "au1", name: "Weekly paid media optimization", schedule: "Mondays 08:00", agent: "Paid Media Analyst", autonomy: "Act with approval", enabled: true, runs: 42, success: 97.6, hoursSaved: 3.5 },
  { id: "au2", name: "CMO weekly brief", schedule: "Mondays 09:00", agent: "Reporting Agent", autonomy: "Act", enabled: true, runs: 38, success: 100, hoursSaved: 4 },
  { id: "au3", name: "Lead scoring refresh", schedule: "Daily 06:00", agent: "Lead Scoring Agent", autonomy: "Act", enabled: true, runs: 211, success: 99.1, hoursSaved: 1 },
  { id: "au4", name: "Anomaly watch · paid + web", schedule: "Every 30 min", agent: "Monitoring Agent", autonomy: "Observe", enabled: true, runs: 1_402, success: 99.8, hoursSaved: 0.2 },
  { id: "au5", name: "SEO technical crawl", schedule: "Sundays 22:00", agent: "SEO Strategist", autonomy: "Suggest", enabled: false, runs: 12, success: 91.7, hoursSaved: 2 },
];

export const AUTOMATION_STATS = { active: 12, runsThisWeek: 148, successRate: 97.3, hoursSaved: 36, creditsUsed: 1_840 } as const;

export type FlowNode = {
  id: string;
  kind: "trigger" | "agent" | "policy" | "approval" | "action" | "log";
  title: string;
  detail: string;
  /** Position in percent of the canvas. */
  x: number;
  y: number;
};

export const FLOW_NODES: readonly FlowNode[] = [
  { id: "n1", kind: "trigger", title: "Schedule", detail: "Mondays 08:00", x: 9, y: 50 },
  { id: "n2", kind: "agent", title: "Paid Media Analyst", detail: "Find wasted spend", x: 28, y: 50 },
  { id: "n3", kind: "policy", title: "Policy check", detail: "Budget change ≤ 20%", x: 47, y: 50 },
  { id: "n4", kind: "approval", title: "Human approval", detail: "Owner: Lena H.", x: 67, y: 26 },
  { id: "n5", kind: "log", title: "Audit log", detail: "Evidence stored", x: 67, y: 76 },
  { id: "n6", kind: "action", title: "Meta Ads", detail: "Pause 3 ad sets", x: 89, y: 26 },
];

export const FLOW_EDGES: readonly [string, string][] = [
  ["n1", "n2"],
  ["n2", "n3"],
  ["n3", "n4"],
  ["n3", "n5"],
  ["n4", "n6"],
];

/** Order the simulated run lights nodes up. It stops at approval, as the real policy would. */
export const RUN_ORDER: readonly string[] = ["n1", "n2", "n3", "n5", "n4"];

export const RECENT_RUNS = [
  { id: "run-1042", automation: "Weekly paid media optimization", started: "Today 08:00", duration: "2m 14s", status: "Waiting approval", credits: 46 },
  { id: "run-1041", automation: "Anomaly watch · paid + web", started: "Today 10:30", duration: "18s", status: "Succeeded", credits: 3 },
  { id: "run-1040", automation: "CMO weekly brief", started: "Today 09:00", duration: "1m 02s", status: "Succeeded", credits: 31 },
  { id: "run-1039", automation: "Lead scoring refresh", started: "Today 06:00", duration: "4m 40s", status: "Succeeded", credits: 58 },
  { id: "run-1038", automation: "SEO technical crawl", started: "Sun 22:00", duration: "12m 09s", status: "Failed", credits: 12 },
] as const;

/* ---------- Approvals ---------- */

export type Approval = {
  id: string;
  title: string;
  automation: string;
  agent: string;
  target: string;
  risk: "Low" | "Medium" | "High";
  impact: string;
  requested: string;
  expires: string;
  evidence: readonly string[];
  change: readonly { item: string; before: string; after: string }[];
  policy: string;
};

export const APPROVALS: readonly Approval[] = [
  {
    id: "ap1",
    title: "Pause 3 Meta ad sets",
    automation: "Weekly paid media optimization",
    agent: "Paid Media Analyst",
    target: "Meta Ads · Acme Cloud EU",
    risk: "Medium",
    impact: "Saves €1,840 / week",
    requested: "Today 08:02",
    expires: "in 22 h",
    evidence: [
      "ROAS below 1.0 for 7 consecutive days on all three",
      "€1,840 / week spend with 4 SQLs attributed",
      "Frequency above 7 indicates audience fatigue",
      "No active experiment uses these ad sets",
    ],
    change: [
      { item: "Retargeting · all visitors", before: "Active · €140/day", after: "Paused" },
      { item: "Retargeting · pricing page", before: "Active · €80/day", after: "Paused" },
      { item: "Lookalike 3% · video", before: "Active · €43/day", after: "Paused" },
    ],
    policy: "Writes to ad platforms above €500/week need the budget owner.",
  },
  {
    id: "ap2",
    title: "Move €6K to Google brand search",
    automation: "Weekly paid media optimization",
    agent: "Paid Media Analyst",
    target: "Google Ads · Brand · Exact",
    risk: "Low",
    impact: "+21 SQL / month projected",
    requested: "Today 08:02",
    expires: "in 22 h",
    evidence: ["Impression share lost to budget: 31%", "Cost per SQL €96 vs €138 blended", "Budget cap hit on Thursday at 14:10"],
    change: [{ item: "Daily budget", before: "€600", after: "€800" }],
    policy: "Budget increases under 20% need one approver.",
  },
  {
    id: "ap3",
    title: "Send win-back sequence to 412 contacts",
    automation: "Retention playbook",
    agent: "Lifecycle Agent",
    target: "Customer.io · Win-back v3",
    risk: "High",
    impact: "~9 reactivations projected",
    requested: "Yesterday 17:40",
    expires: "in 3 h",
    evidence: ["412 churned accounts, consent verified", "Copy approved by brand checker (score 94)", "Last sent to this segment 94 days ago"],
    change: [
      { item: "Audience", before: "—", after: "412 contacts" },
      { item: "Sequence", before: "Draft", after: "Live · 3 emails" },
    ],
    policy: "Customer-facing sends need marketing lead approval.",
  },
];

/* ---------- Integrations ---------- */

export type ConnectionStatus = "healthy" | "delayed" | "error" | "available";

export type Connection = {
  connectorId: string;
  status: ConnectionStatus;
  lastSync: string;
  records: string;
  scopes: string;
  note?: string;
};

export const CONNECTIONS: readonly Connection[] = [
  { connectorId: "ga4", status: "delayed", lastSync: "2 h 10 m ago", records: "1.2M events", scopes: "1 property", note: "Google API quota; retry in 12 min" },
  { connectorId: "gads", status: "healthy", lastSync: "12 min ago", records: "48K rows", scopes: "3 accounts" },
  { connectorId: "meta", status: "healthy", lastSync: "12 min ago", records: "31K rows", scopes: "2 ad accounts" },
  { connectorId: "linkedin", status: "healthy", lastSync: "40 min ago", records: "6K rows", scopes: "1 account" },
  { connectorId: "hubspot", status: "healthy", lastSync: "4 min ago", records: "184K contacts", scopes: "Contacts, deals" },
  { connectorId: "gsc", status: "healthy", lastSync: "6 h ago", records: "92K queries", scopes: "2 sites" },
  { connectorId: "customerio", status: "error", lastSync: "1 d ago", records: "—", scopes: "1 workspace", note: "Token expired. Reconnect needed." },
  { connectorId: "linear", status: "healthy", lastSync: "30 min ago", records: "1.1K issues", scopes: "Marketing team" },
  { connectorId: "salesforce", status: "available", lastSync: "—", records: "—", scopes: "—" },
  { connectorId: "notion", status: "available", lastSync: "—", records: "—", scopes: "—" },
];
