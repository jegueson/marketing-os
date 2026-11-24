import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { NotFoundError } from "@marketing-os/core";
import { featureFlags } from "@marketing-os/db";
import { run, userContext, type HonoEnv } from "../context";

/**
 * The flag hides the surface. A disabled route answers 404, including for a caller who could write.
 */
export const requireConfigEnabled = createMiddleware<HonoEnv>(async (c, next) => {
  const [flag] = await run(c, userContext(c.get("principal")), (tx) =>
    tx.select({ isEnabled: featureFlags.isEnabled }).from(featureFlags).where(eq(featureFlags.key, "specialist_config")),
  );
  if (!flag?.isEnabled) throw new NotFoundError();
  await next();
});
