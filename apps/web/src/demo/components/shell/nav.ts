import {
  BrainCircuit,
  Cable,
  Clapperboard,
  LayoutDashboard,
  Leaf,
  type LucideIcon,
  MessagesSquare,
  Radar,
  Repeat,
  ShieldCheck,
  SunMedium,
  TrendingUp,
  Users,
  Workflow,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; badge?: string };
export type NavGroup = { label: string; items: readonly NavItem[] };

export const NAV: readonly NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/demo/today", label: "Today", icon: SunMedium },
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
    label: "Grow",
    items: [
      { href: "/demo/intelligence", label: "Intelligence", icon: Radar },
      { href: "/demo/studio", label: "Studio", icon: Clapperboard },
      { href: "/demo/influencers", label: "Influencers", icon: Users },
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
