import { canTransitionLead, isRole, leadStatuses, roleHasPermission, type LeadStatus } from "@marketing-os/core";

export type Membership = {
  tenantId: string;
  tenantName: string;
  role: string;
  workspaceId: string;
  workspaceName: string;
};

export type Me = {
  userId: string;
  email: string;
  staffRole: "platform_admin" | "success_manager" | "ai_specialist" | null;
  deploymentMode: "self_hosted" | "cloud";
  memberships: Membership[];
};

/** The requested workspace when the user belongs to it, otherwise the first one. */
export function pickWorkspace(
  memberships: readonly Membership[],
  requested: string | null,
): Membership | null {
  return memberships.find((m) => m.workspaceId === requested) ?? memberships[0] ?? null;
}

/** Status buttons shown on a lead. Conversion has its own action. */
export function nextLeadStatuses(status: string): LeadStatus[] {
  if (!(leadStatuses as readonly string[]).includes(status)) return [];
  return leadStatuses.filter(
    (to) => to !== "converted" && canTransitionLead(status as LeadStatus, to),
  );
}

/** Where to send a user after sign-in when no `next` was given. */
export function homeFor(me: Me): string {
  if (me.staffRole) return "/console";
  return "/portal";
}

/** Only same-origin relative paths are accepted as a post-login redirect. */
export function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

/** Model settings are limited to roles with `models:manage`. */
export function canManageModels(role: string): boolean {
  return isRole(role) && roleHasPermission(role, "models:manage");
}

/** Ask is limited to roles with `ask:use`. The nav also requires the `ask_marketing` flag. */
export function canUseAsk(role: string): boolean {
  return isRole(role) && roleHasPermission(role, "ask:use");
}

/** Portal links for one workspace. Models and Ask stay hidden without permission and flag. */
export function portalLinks(
  workspaceId: string,
  role: string,
  flags: Readonly<Record<string, boolean>> = {},
): { href: string; label: string }[] {
  const q = `?ws=${encodeURIComponent(workspaceId)}`;
  const links = [
    { href: `/portal${q}`, label: "Home" },
    { href: `/portal/onboarding${q}`, label: "Onboarding" },
    { href: `/portal/integrations${q}`, label: "Integrations" },
    { href: `/portal/cockpit${q}`, label: "Cockpit" },
  ];
  if (flags.ask_marketing === true && canUseAsk(role)) {
    links.push({ href: `/portal/ask${q}`, label: "Ask" });
  }
  if (canManageModels(role)) {
    links.push({ href: `/portal/settings/models${q}`, label: "Models" });
  }
  return links;
}
