/** Today home — role-aware daily workspace for the investor demo. */

export type DemoRole = "cmo" | "performance" | "creative" | "crm" | "specialist";

export type RoleOption = { id: DemoRole; label: string; title: string };

export const ROLES: readonly RoleOption[] = [
  { id: "cmo", label: "CMO", title: "Lena Hoffmann · VP Marketing" },
  { id: "performance", label: "Performance", title: "Marco Rossi · Paid Media Lead" },
  { id: "creative", label: "Creative", title: "Sofia Berg · Brand & Content" },
  { id: "crm", label: "CRM", title: "Priya Shah · Lifecycle" },
  { id: "specialist", label: "Specialist", title: "Alex Nguyen · Marketing OS Specialist" },
] as const;

export type TodayItem = {
  id: string;
  kind: "approval" | "alert" | "task" | "brief" | "job";
  title: string;
  detail: string;
  age: string;
  href: string;
  tone: "primary" | "warning" | "danger" | "success" | "violet";
};

export const TODAY_BY_ROLE: Record<DemoRole, readonly TodayItem[]> = {
  cmo: [
    { id: "c1", kind: "approval", title: "Pause 3 Meta retargeting ad sets", detail: "Saves €1,840 / week · High risk", age: "18 min", href: "/demo/approvals", tone: "warning" },
    { id: "c2", kind: "alert", title: "/pricing conversion down 21%", detail: "Since the Nov 4 page release", age: "6 h", href: "/demo/cockpit", tone: "danger" },
    { id: "c3", kind: "task", title: "Review weekly CMO brief", detail: "Linear · MOS-482", age: "1 h", href: "/demo/ask", tone: "primary" },
    { id: "c4", kind: "alert", title: "Competitor Orbit Desk published /pricing-eu", detail: "Market intelligence digest", age: "1 d", href: "/demo/intelligence", tone: "violet" },
  ],
  performance: [
    { id: "p1", kind: "approval", title: "Shift €18K Meta → Google Search", detail: "Expected +€64K pipeline / month", age: "18 min", href: "/demo/approvals", tone: "warning" },
    { id: "p2", kind: "alert", title: "Meta Ads CPA up 32% in 3 days", detail: "Retargeting · frequency 7.4", age: "18 min", href: "/demo/performance", tone: "danger" },
    { id: "p3", kind: "task", title: "Cap frequency on LAL 3%", detail: "Linear · MOS-491", age: "3 h", href: "/demo/performance", tone: "primary" },
    { id: "p4", kind: "job", title: "Weekly paid media run waiting", detail: "Automations · approval gate", age: "2 h", href: "/demo/automations", tone: "warning" },
  ],
  creative: [
    { id: "cr1", kind: "brief", title: "Workflow automation pillar page", detail: "SEO brief ready for generation", age: "2 h", href: "/demo/studio", tone: "violet" },
    { id: "cr2", kind: "job", title: "Runway · 4 video variants ready", detail: "Brand check passed", age: "40 min", href: "/demo/studio", tone: "success" },
    { id: "cr3", kind: "approval", title: "Publish LinkedIn carousel set", detail: "Waiting on brand lead", age: "1 h", href: "/demo/approvals", tone: "warning" },
    { id: "cr4", kind: "task", title: "Update messaging framework v3", detail: "Notion · Brand profile", age: "1 d", href: "/demo/studio", tone: "primary" },
  ],
  crm: [
    { id: "m1", kind: "alert", title: "64 accounts in low-usage churn risk", detail: "Retention module", age: "4 h", href: "/demo/retention", tone: "danger" },
    { id: "m2", kind: "task", title: "Ship win-back sequence B", detail: "Customer.io · draft", age: "1 d", href: "/demo/retention", tone: "primary" },
    { id: "m3", kind: "approval", title: "Re-score HubSpot contacts overnight", detail: "Lead scoring agent", age: "6 h", href: "/demo/approvals", tone: "warning" },
    { id: "m4", kind: "alert", title: "Trial nurture open rate −8 pts", detail: "Lifecycle · last 7 days", age: "2 d", href: "/demo/retention", tone: "warning" },
  ],
  specialist: [
    { id: "s1", kind: "alert", title: "SEO crawl automation failed", detail: "Acme Cloud · Sunday run", age: "1 d", href: "/demo/automations", tone: "danger" },
    { id: "s2", kind: "task", title: "Raise Paid Media Analyst eval to 0.86", detail: "Console · skill eval", age: "3 h", href: "/demo/console", tone: "primary" },
    { id: "s3", kind: "brief", title: "Configure Higgsfield connector for Acme", detail: "Creative-tool port", age: "2 d", href: "/demo/integrations", tone: "violet" },
    { id: "s4", kind: "alert", title: "Customer.io needs reconnect", detail: "Token expired", age: "5 h", href: "/demo/integrations", tone: "warning" },
  ],
};

export const TODAY_STATS: Record<DemoRole, readonly { label: string; value: string }[]> = {
  cmo: [
    { label: "Waiting on you", value: "1" },
    { label: "Pipeline", value: "€1.24M" },
    { label: "Open alerts", value: "2" },
  ],
  performance: [
    { label: "CPA alerts", value: "1" },
    { label: "Paid ROAS", value: "4.2x" },
    { label: "Approvals", value: "1" },
  ],
  creative: [
    { label: "Jobs ready", value: "1" },
    { label: "Open briefs", value: "1" },
    { label: "In approval", value: "1" },
  ],
  crm: [
    { label: "At-risk accounts", value: "64" },
    { label: "Open alerts", value: "2" },
    { label: "Open tasks", value: "1" },
  ],
  specialist: [
    { label: "Failed runs", value: "1" },
    { label: "Open alerts", value: "2" },
    { label: "Open tasks", value: "1" },
  ],
};
