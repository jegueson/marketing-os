/**
 * Investor tour script. Each step points at an element marked with
 * data-tour="<target>" on the given route. Order follows the product thesis:
 * connect → daily workspace → display → ask → grow → automate → govern → configure.
 */
export type TourStep = {
  route: string;
  target: string;
  eyebrow: string;
  title: string;
  body: string;
};

export const TOUR_STEPS: readonly TourStep[] = [
  {
    route: "/demo/onboarding",
    target: "onboarding-stack",
    eyebrow: "Connect",
    title: "Start from the stack the team already uses",
    body: "No migration. A marketing team connects GA4, ad platforms and the CRM in minutes. Read-only by default.",
  },
  {
    route: "/demo/today",
    target: "today-queue",
    eyebrow: "Daily workspace",
    title: "Every marketer opens Today",
    body: "Role-aware queue of approvals, alerts, tasks and jobs. Marketing OS is the daily place to work — not only a CMO dashboard.",
  },
  {
    route: "/demo/cockpit",
    target: "cockpit-kpis",
    eyebrow: "Display",
    title: "One cockpit for the whole marketing function",
    body: "Every KPI carries its target, previous period, source and freshness. No more stitching spreadsheets on Monday morning.",
  },
  {
    route: "/demo/cockpit",
    target: "cockpit-pulse",
    eyebrow: "Display",
    title: "Meaningful change, not every metric",
    body: "The performance pulse compares this period with the last one so the CMO sees direction at a glance.",
  },
  {
    route: "/demo/cockpit",
    target: "cockpit-attention",
    eyebrow: "Understand",
    title: "The attention queue does the watching",
    body: "Anomalies, risks and data issues are detected continuously and ranked by impact.",
  },
  {
    route: "/demo/cockpit",
    target: "cockpit-recommendations",
    eyebrow: "Recommend",
    title: "Recommendations with evidence and confidence",
    body: "Each action states the problem, the evidence, the expected impact and the effort. A human decides.",
  },
  {
    route: "/demo/ask",
    target: "ask-thread",
    eyebrow: "Ask",
    title: "Ask Marketing: answers from your own data",
    body: "Plain-language questions return charts and tables with sources, time range and freshness. No black box.",
  },
  {
    route: "/demo/ask",
    target: "ask-evidence",
    eyebrow: "Trust",
    title: "Every answer shows its working",
    body: "The query plan is visible: intent, metric definitions, sources, query and validation.",
  },
  {
    route: "/demo/performance",
    target: "performance-funnel",
    eyebrow: "Modules",
    title: "Deep modules for each marketing area",
    body: "Performance, Organic and Retention share one metric layer, so numbers agree across every view.",
  },
  {
    route: "/demo/intelligence",
    target: "intelligence-competitors",
    eyebrow: "Grow",
    title: "Market intelligence and competitors",
    body: "Track competitors, ad libraries, SEO visibility and review themes from official APIs and licensed data.",
  },
  {
    route: "/demo/studio",
    target: "studio-generate",
    eyebrow: "Create",
    title: "Creative studio with AI tools you already use",
    body: "Brief, generate with Runway, Higgsfield or ComfyUI, brand-check, then approve before publish. Bring your own keys.",
  },
  {
    route: "/demo/influencers",
    target: "influencers-search",
    eyebrow: "Grow",
    title: "Influencer marketing in the same OS",
    body: "Discover creators, run campaigns and read attributed pipeline from Skeepers and similar platforms.",
  },
  {
    route: "/demo/automations",
    target: "automations-canvas",
    eyebrow: "Automate",
    title: "Recurring work becomes governed workflows",
    body: "Agents run the weekly analysis. Policies decide what needs a human. Press Run to watch one execute.",
  },
  {
    route: "/demo/automations",
    target: "automations-external",
    eyebrow: "Integrate",
    title: "Keep n8n, Zapier or Make — do not reinvent them",
    body: "Marketing OS sends signed events and accepts scoped actions. Risky work still hits Approvals.",
  },
  {
    route: "/demo/approvals",
    target: "approvals-detail",
    eyebrow: "Govern",
    title: "Risky actions wait for an approval",
    body: "The default autonomy is observe. Writes to ad platforms or the CRM require a policy and, when it says so, a sign-off.",
  },
  {
    route: "/demo/integrations",
    target: "integrations-grid",
    eyebrow: "Data health",
    title: "Connectors with health you can see",
    body: "Freshness, scopes and sync status per source. Broken data is flagged before it becomes a wrong decision.",
  },
  {
    route: "/demo/console",
    target: "console-tabs",
    eyebrow: "Configure",
    title: "Specialists tailor skills, agents and prompts",
    body: "This is where Expert Services and the community build value on top of the open-source core.",
  },
];
