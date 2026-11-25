import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { NotFoundError } from "@marketing-os/core";
import { featureFlags } from "@marketing-os/db";
import { run, userContext, type AppContext, type HonoEnv } from "../context";

/** True only when the platform flag row is enabled. A missing row stays off. */
export async function managedWorkEnabled(c: AppContext): Promise<boolean> {
  const [flag] = await run(c, userContext(c.get("principal")), (tx) =>
    tx.select({ isEnabled: featureFlags.isEnabled }).from(featureFlags).where(eq(featureFlags.key, "managed_work")),
  );
  return flag?.isEnabled === true;
}

/** A disabled managed-work route answers 404, including for a caller who could decide. */
export const requireManagedWork = createMiddleware<HonoEnv>(async (c, next) => {
  if (!(await managedWorkEnabled(c))) throw new NotFoundError();
  await next();
});
