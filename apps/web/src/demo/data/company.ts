/**
 * Fictional demo tenant. Every number in /demo is invented for presentation
 * and comes from this folder; nothing is fetched from the API.
 */
export const COMPANY = {
  name: "Acme Cloud",
  legalNote: "Fictional company. All figures are demo data.",
  industry: "B2B SaaS · workflow software",
  team: "Growth Marketing",
  period: "Last 30 days",
  freshness: "Synced 4 min ago",
  user: { name: "Lena Hoffmann", role: "VP Marketing", initials: "LH" },
} as const;

export type Connector = {
  id: string;
  name: string;
  category: "Analytics" | "Paid media" | "CRM" | "SEO" | "Email" | "Work";
  monogram: string;
  /** Brand-neutral tile color; the demo does not ship third-party logos. */
  hue: string;
};

export const CONNECTORS: readonly Connector[] = [
  { id: "ga4", name: "Google Analytics 4", category: "Analytics", monogram: "G4", hue: "#f59e0b" },
  { id: "gads", name: "Google Ads", category: "Paid media", monogram: "Ad", hue: "#3b82f6" },
  { id: "meta", name: "Meta Ads", category: "Paid media", monogram: "M", hue: "#2563eb" },
  { id: "linkedin", name: "LinkedIn Ads", category: "Paid media", monogram: "in", hue: "#0ea5e9" },
  { id: "hubspot", name: "HubSpot", category: "CRM", monogram: "H", hue: "#f97316" },
  { id: "gsc", name: "Search Console", category: "SEO", monogram: "SC", hue: "#22c55e" },
  { id: "customerio", name: "Customer.io", category: "Email", monogram: "C", hue: "#8b5cf6" },
  { id: "salesforce", name: "Salesforce", category: "CRM", monogram: "SF", hue: "#06b6d4" },
  { id: "linear", name: "Linear", category: "Work", monogram: "L", hue: "#6366f1" },
  { id: "notion", name: "Notion", category: "Work", monogram: "N", hue: "#94a3b8" },
];

export function connector(id: string): Connector {
  const found = CONNECTORS.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown demo connector: ${id}`);
  return found;
}
