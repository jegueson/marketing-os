import { ValidationError, ok } from "@marketing-os/core";
import { invitationAcceptSchema } from "@marketing-os/schemas";
import { requirePrincipal } from "../auth/principal";
import {
  apiSuccessSchema,
  createRouter,
  defineRoute,
  errorResponses,
  jsonBody,
  jsonContent,
  jsonValueSchema,
} from "../lib/openapi";
import { run, userContext } from "../context";
import { acceptInvitation } from "../services/invitations";

export const invitationRoutes = createRouter();

const acceptRoute = defineRoute({
  method: "post",
  path: "/api/v1/invitations/accept",
  tags: ["Invitations"],
  security: [{ Bearer: [] }],
  middleware: [requirePrincipal],
  request: { body: jsonBody(invitationAcceptSchema as never) },
  responses: {
    200: jsonContent(apiSuccessSchema(jsonValueSchema, "InvitationAcceptResponse"), "Invitation accepted"),
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

invitationRoutes.openapi(acceptRoute, async (c) => {
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
  return c.json(ok(result), 200);
});
