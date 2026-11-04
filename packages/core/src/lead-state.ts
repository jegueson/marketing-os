export const leadStatuses = [
  "new",
  "contacted",
  "discovery",
  "qualified",
  "converted",
  "disqualified",
  "archived",
] as const;

export type LeadStatus = (typeof leadStatuses)[number];

const transitions: Record<LeadStatus, readonly LeadStatus[]> = {
  new: ["contacted", "disqualified", "archived"],
  contacted: ["discovery", "disqualified", "archived"],
  discovery: ["qualified", "disqualified", "archived"],
  qualified: ["converted", "disqualified", "archived"],
  converted: [],
  disqualified: ["archived"],
  archived: [],
};

export function canTransitionLead(from: LeadStatus, to: LeadStatus): boolean {
  return transitions[from].includes(to);
}

export function assertLeadTransition(from: LeadStatus, to: LeadStatus): void {
  if (!canTransitionLead(from, to)) {
    throw new Error(`Illegal lead transition: ${from} -> ${to}`);
  }
}
