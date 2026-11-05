import { canTransitionLead, leadStatuses, type LeadStatus } from "@marketing-os/core";

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
