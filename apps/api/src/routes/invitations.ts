import { Hono } from "hono";
import { ValidationError, ok } from "@marketing-os/core";
import { invitationAcceptSchema } from "@marketing-os/schemas";
import { requirePrincipal } from "../auth/principal";
import { run, userContext, type HonoEnv } from "../context";
import { acceptInvitation } from "../services/invitations";

export const invitationRoutes = new Hono<HonoEnv>();

invitationRoutes.post("/api/v1/invitations/accept", requirePrincipal, async (c) => {
  const parsed = invitationAcceptSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new ValidationError("Invalid invitation token");
  const principal = c.get("principal");
  const result = await run(c, userContext(principal), (tx) =>
    acceptInvitation(tx, {
      token: parsed.data.token,
      userId: principal.userId,
      email: principal.email,
      requestId: c.get("requestId"),
    }),
  );
  return c.json(ok(result));
});
