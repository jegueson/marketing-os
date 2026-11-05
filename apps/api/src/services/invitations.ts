import { and, eq, sql } from "drizzle-orm";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  formatLogLine,
  type EmailSender,
} from "@marketing-os/core";
import { invitations, selectRows, setTenant, tenantMemberships, type Database } from "@marketing-os/db";
import { createToken, hashToken } from "../lib/tokens";
import { recordAudit } from "../lib/events";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type IssuedInvitation = {
  id: string;
  tenantId: string;
  email: string;
  expiresAt: Date;
  token: string;
};

export async function issueInvitation(
  tx: Database,
  input: { tenantId: string; email: string; role: "customer_admin" | "customer_user"; invitedBy: string },
): Promise<IssuedInvitation> {
  const token = createToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const [row] = await tx
    .insert(invitations)
    .values({
      tenantId: input.tenantId,
      email: input.email.toLowerCase(),
      role: input.role,
      invitedBy: input.invitedBy,
      tokenHash: await hashToken(token),
      expiresAt,
    })
    .returning({ id: invitations.id });
  if (!row) throw new Error("Invitation insert returned no row");
  return { id: row.id, tenantId: input.tenantId, email: input.email.toLowerCase(), expiresAt, token };
}

/** Resend rotates the token: the old link stops working. Caller holds the tenant context. */
export async function rotateInvitation(tx: Database, invitationId: string): Promise<IssuedInvitation> {
  const token = createToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const [row] = await tx
    .update(invitations)
    .set({ tokenHash: await hashToken(token), expiresAt, updatedAt: new Date() })
    .where(and(eq(invitations.id, invitationId), eq(invitations.status, "pending")))
    .returning({ id: invitations.id, tenantId: invitations.tenantId, email: invitations.email });
  if (!row) throw new NotFoundError("Pending invitation not found");
  return { id: row.id, tenantId: row.tenantId, email: row.email, expiresAt, token };
}

export async function revokeInvitation(tx: Database, invitationId: string): Promise<void> {
  const [row] = await tx
    .update(invitations)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(invitations.id, invitationId), eq(invitations.status, "pending")))
    .returning({ id: invitations.id });
  if (!row) throw new NotFoundError("Pending invitation not found");
}

type InvitationRow = {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string | Date;
};

/**
 * Accepts in the caller's user context. Membership is created only when the
 * signed-in email matches the invited email. The token works once.
 */
export async function acceptInvitation(
  tx: Database,
  input: { token: string; userId: string; email: string; requestId: string },
): Promise<{ tenantId: string; role: string }> {
  const hash = await hashToken(input.token);
  const [row] = await selectRows<InvitationRow>(
    tx,
    sql`select * from app.invitation_by_token_hash(${hash})`,
  );
  if (!row) throw new NotFoundError("Invitation not found");
  if (row.status === "accepted") throw new ConflictError("Invitation already used");
  if (row.status !== "pending") throw new AppError("invitation_revoked", "Invitation was revoked", 410);
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new AppError("invitation_expired", "Invitation expired. Ask for a new one.", 410);
  }
  if (row.email.toLowerCase() !== input.email.toLowerCase()) {
    throw new ForbiddenError("Sign in with the email address that received the invitation");
  }

  await setTenant(tx, row.tenant_id);
  const [claimed] = await tx
    .update(invitations)
    .set({ status: "accepted", acceptedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(invitations.id, row.id), eq(invitations.status, "pending")))
    .returning({ id: invitations.id });
  if (!claimed) throw new ConflictError("Invitation already used");

  await tx
    .insert(tenantMemberships)
    .values({ tenantId: row.tenant_id, userId: input.userId, role: row.role })
    .onConflictDoNothing({ target: [tenantMemberships.tenantId, tenantMemberships.userId] });
  await recordAudit(tx, {
    eventType: "invitation.accepted",
    tenantId: row.tenant_id,
    actorId: input.userId,
    actorRole: row.role,
    resourceType: "invitation",
    resourceId: row.id,
    requestId: input.requestId,
  });
  return { tenantId: row.tenant_id, role: row.role };
}

/**
 * Runs after the provisioning transaction commits. A delivery failure is logged and
 * reported to the caller, who can resend; it never undoes the committed tenant.
 */
export async function sendInvitationEmail(
  getSender: () => EmailSender,
  appOrigin: string,
  invite: IssuedInvitation,
  tenantName: string,
): Promise<"sent" | "failed"> {
  const link = `${appOrigin.replace(/\/$/, "")}/invite/${invite.token}`;
  try {
    await getSender().send({
      to: invite.email,
      subject: `You're invited to ${tenantName} on Marketing OS`,
      text: `Open this link to join ${tenantName}: ${link}\n\nThe link expires on ${invite.expiresAt.toUTCString()}.`,
      html: `<p>Open this link to join ${escapeHtml(tenantName)}:</p><p><a href="${link}">${link}</a></p>`,
    });
    return "sent";
  } catch (err) {
    console.error(
      formatLogLine({
        level: "error",
        message: "invitation email failed",
        invitationId: invite.id,
        tenantId: invite.tenantId,
        code: (err as { code?: string }).code ?? "unknown",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return "failed";
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
