/**
 * Scripted Ask Marketing answers. Shape mirrors the PRD §14 trust contract:
 * answer, evidence (chart/table), sources, time range, freshness, confidence, query plan.
 */
export type AskTable = { headers: readonly string[]; rows: readonly (readonly string[])[] };

export type AskAnswer = {
  id: string;
  keywords: readonly string[];
  question: string;
  summary: string;
  chartTitle: string;
  chart: readonly { label: string; value: number }[];
  chartKind: "number" | "eur";
  table: AskTable;
  sources: readonly string[];
  timeRange: string;
  freshness: string;
  confidence: "High" | "Medium";
  plan: readonly { step: string; detail: string }[];
  followUps: readonly string[];
};

export const ASK_SCRIPTS: readonly AskAnswer[] = [
  {
    id: "leads",
    keywords: ["leads", "lead", "decline", "declined", "drop", "dropped", "sql", "why"],
    question: "Why did qualified leads decline last week?",
    summary:
      "Qualified leads fell 23% week over week (212 → 163). Two causes explain 81% of the drop: Google Ads brand search lost impression share after a budget cap was hit on Thursday, and the /pricing page converts 21% worse since the Nov 4 release. Organic and email held steady.",
    chartTitle: "SQLs per day · last week",
    chart: [
      { label: "Mon", value: 34 },
      { label: "Tue", value: 33 },
      { label: "Wed", value: 32 },
      { label: "Thu", value: 21 },
      { label: "Fri", value: 19 },
      { label: "Sat", value: 11 },
      { label: "Sun", value: 13 },
    ],
    chartKind: "number",
    table: {
      headers: ["Driver", "Channel", "SQL impact", "Share of drop"],
      rows: [
        ["Brand search budget cap", "Google Ads", "-24", "49%"],
        ["/pricing conversion drop", "Website", "-16", "32%"],
        ["Retargeting fatigue", "Meta Ads", "-6", "12%"],
        ["Other", "Mixed", "-3", "7%"],
      ],
    },
    sources: ["Google Ads", "HubSpot", "GA4"],
    timeRange: "Nov 3 – Nov 9 vs Oct 27 – Nov 2",
    freshness: "Data as of 10:42 today",
    confidence: "High",
    plan: [
      { step: "Intent", detail: "Diagnose a decline in metric sql_count" },
      { step: "Metrics", detail: "sql_count v3 · lead_to_sql_rate v2" },
      { step: "Sources", detail: "HubSpot lifecycle, Google Ads, GA4 sessions" },
      { step: "Query", detail: "Week over week, split by channel and landing page" },
      { step: "Validate", detail: "Cross-source totals agree within 1.8%" },
    ],
    followUps: ["Which campaigns are inefficient?", "Compare channels by SQL", "What changed last month?"],
  },
  {
    id: "inefficient",
    keywords: ["inefficient", "campaigns", "campaign", "waste", "wasted", "cpa", "roas"],
    question: "Which campaigns are inefficient?",
    summary:
      "Four campaigns spend €21.6K a month above the CPA guardrail of €140 per SQL. Meta retargeting is the largest: €9.2K spend at €184 per SQL with frequency above 7. Pausing or reallocating these is projected to add 46 SQLs a month at the same spend.",
    chartTitle: "Cost per SQL by campaign (€)",
    chart: [
      { label: "Retarget", value: 184 },
      { label: "LAL 3%", value: 171 },
      { label: "Generic", value: 162 },
      { label: "LinkedIn", value: 151 },
      { label: "Brand", value: 96 },
      { label: "Webinar", value: 88 },
    ],
    chartKind: "eur",
    table: {
      headers: ["Campaign", "Spend / mo", "Cost per SQL", "Recommendation"],
      rows: [
        ["Meta · Retargeting all visitors", "€9,200", "€184", "Cap frequency, cut 50%"],
        ["Meta · Lookalike 3%", "€5,100", "€171", "Refresh creative"],
        ["Google · Generic 'automation'", "€4,300", "€162", "Tighten match types"],
        ["LinkedIn · Job titles broad", "€3,000", "€151", "Narrow to ICP accounts"],
      ],
    },
    sources: ["Meta Ads", "Google Ads", "LinkedIn Ads", "HubSpot"],
    timeRange: "Oct 12 – Nov 10",
    freshness: "Data as of 10:42 today",
    confidence: "High",
    plan: [
      { step: "Intent", detail: "Rank campaigns by efficiency against guardrail" },
      { step: "Metrics", detail: "cost_per_sql v2 · spend v1 · policy cpa_guardrail" },
      { step: "Sources", detail: "Ad platforms joined to HubSpot by UTM" },
      { step: "Query", detail: "Last 30 days, campaigns with ≥ €2K spend" },
      { step: "Validate", detail: "Attribution coverage 94% of SQLs" },
    ],
    followUps: ["Why did qualified leads decline last week?", "Compare channels by SQL"],
  },
  {
    id: "channels",
    keywords: ["compare", "channels", "channel", "acquisition", "mix", "best"],
    question: "Compare acquisition channels using qualified leads.",
    summary:
      "Paid search delivers the most SQLs (318) at the lowest blended cost (€118). Organic is second by volume and has the best SQL-to-opportunity rate (41%). Paid social is the most expensive channel per SQL and the only one trending worse.",
    chartTitle: "SQLs by channel · last 30 days",
    chart: [
      { label: "Search", value: 318 },
      { label: "Organic", value: 214 },
      { label: "Social", value: 142 },
      { label: "Email", value: 96 },
      { label: "Events", value: 48 },
      { label: "Referral", value: 24 },
    ],
    chartKind: "number",
    table: {
      headers: ["Channel", "SQLs", "Cost per SQL", "SQL → Opp"],
      rows: [
        ["Paid search", "318", "€118", "33%"],
        ["Organic", "214", "—", "41%"],
        ["Paid social", "142", "€176", "24%"],
        ["Email", "96", "€22", "37%"],
      ],
    },
    sources: ["HubSpot", "Google Ads", "Meta Ads", "GA4"],
    timeRange: "Oct 12 – Nov 10",
    freshness: "Data as of 10:42 today",
    confidence: "Medium",
    plan: [
      { step: "Intent", detail: "Compare channels on sql_count and efficiency" },
      { step: "Metrics", detail: "sql_count v3 · cost_per_sql v2 · sql_to_opp v1" },
      { step: "Sources", detail: "HubSpot original source + ad spend" },
      { step: "Query", detail: "Group by channel taxonomy v4" },
      { step: "Validate", detail: "11% of SQLs have no source; flagged" },
    ],
    followUps: ["Which campaigns are inefficient?", "What changed last month?"],
  },
  {
    id: "changed",
    keywords: ["changed", "change", "month", "last", "happened", "summary", "summarize"],
    question: "What changed last month?",
    summary:
      "October closed at €1.24M marketing pipeline, 18% above September and 3% above target. The biggest positive change was organic: non-brand clicks grew 27% after the comparison pages shipped. The biggest negative change was paid social efficiency, with CPA up 19%.",
    chartTitle: "Marketing pipeline by month (€)",
    chart: [
      { label: "Jun", value: 820_000 },
      { label: "Jul", value: 870_000 },
      { label: "Aug", value: 910_000 },
      { label: "Sep", value: 1_047_000 },
      { label: "Oct", value: 1_240_000 },
    ],
    chartKind: "eur",
    table: {
      headers: ["Change", "Metric", "Before", "After"],
      rows: [
        ["Organic comparison pages", "Non-brand clicks", "18.2K", "23.1K"],
        ["Webinar series launch", "SQLs from events", "29", "48"],
        ["Meta creative fatigue", "Paid social CPA", "€148", "€176"],
      ],
    },
    sources: ["HubSpot", "Search Console", "Meta Ads", "GA4"],
    timeRange: "October vs September 2026",
    freshness: "Data as of 10:42 today",
    confidence: "High",
    plan: [
      { step: "Intent", detail: "Month-over-month change summary" },
      { step: "Metrics", detail: "Executive KPI set v5" },
      { step: "Sources", detail: "All connected sources" },
      { step: "Query", detail: "Rank changes by absolute pipeline impact" },
      { step: "Validate", detail: "Month totals reconcile with HubSpot report" },
    ],
    followUps: ["Why did qualified leads decline last week?", "Which campaigns are inefficient?"],
  },
];

export const ASK_STARTERS: readonly string[] = ASK_SCRIPTS.map((s) => s.question);
