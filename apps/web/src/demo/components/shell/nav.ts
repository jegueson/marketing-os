import {
  BrainCircuit,
  Cable,
  LayoutDashboard,
  Leaf,
  type LucideIcon,
  MessagesSquare,
  Repeat,
  ShieldCheck,
  TrendingUp,
  Workflow,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; badge?: string };
export type NavGroup = { label: string; items: readonly NavItem[] };

export const NAV: readonly NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/demo/cockpit", label: "Cockpit", icon: LayoutDashboard },
      { href: "/demo/ask", label: "Ask Marketing", icon: MessagesSquare, badge: "AI" },
    ],
  },
  {
    label: "Modules",
    items: [
      { href: "/demo/performance", label: "Performance", icon: TrendingUp },
      { href: "/demo/organic", label: "Organic", icon: Leaf },
      { href: "/demo/retention", label: "Retention", icon: Repeat },
    ],
  },
  {
    label: "Operate",
    items: [
      { href: "/demo/automations", label: "Automations", icon: Workflow },
      { href: "/demo/approvals", label: "Approvals", icon: ShieldCheck, badge: "3" },
      { href: "/demo/integrations", label: "Integrations", icon: Cable },
    ],
  },
  {
    label: "Specialists",
    items: [{ href: "/demo/console", label: "Console", icon: BrainCircuit }],
  },
];
