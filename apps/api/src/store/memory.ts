import type { LeadStatus, Role } from "@marketing-os/core";

export type LeadRecord = {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  jobTitle?: string;
  country?: string;
  industry?: string;
  intent: string;
  status: LeadStatus;
  majorProblem?: string;
  objectives?: string;
  createdAt: string;
  convertedTenantId?: string;
};

export type TenantRecord = {
  id: string;
  slug: string;
  name: string;
};

export type WorkspaceRecord = {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
};

export type ConnectionRecord = {
  id: string;
  tenantId: string;
  workspaceId: string;
  connectorSlug: string;
  displayName: string;
  status: "pending" | "active" | "error";
  scopes: string[];
};

export type InvitationRecord = {
  id: string;
  tenantId: string;
  email: string;
  role: Role;
  tokenHash: string;
  status: "pending" | "accepted" | "expired" | "cancelled";
  expiresAt: string;
};

export type ChecklistItem = {
  key: string;
  title: string;
  status: "pending" | "completed";
};

const leads = new Map<string, LeadRecord>();
const tenants = new Map<string, TenantRecord>();
const workspaces = new Map<string, WorkspaceRecord>();
const connections = new Map<string, ConnectionRecord>();
const invitations = new Map<string, InvitationRecord>();
const checklists = new Map<string, ChecklistItem[]>();
const notes = new Map<string, { id: string; leadId: string; body: string; createdAt: string }[]>();
const audit: { id: string; eventType: string; tenantId?: string; payload: unknown; createdAt: string }[] =
  [];

export const memoryStore = {
  leads,
  tenants,
  workspaces,
  connections,
  invitations,
  checklists,
  notes,
  audit,
  reset() {
    leads.clear();
    tenants.clear();
    workspaces.clear();
    connections.clear();
    invitations.clear();
    checklists.clear();
    notes.clear();
    audit.length = 0;
  },
  recordAudit(eventType: string, payload: unknown, tenantId?: string) {
    const entry: (typeof audit)[number] = {
      id: crypto.randomUUID(),
      eventType,
      payload,
      createdAt: new Date().toISOString(),
    };
    if (tenantId) entry.tenantId = tenantId;
    audit.push(entry);
  },
};
