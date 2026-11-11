import { z } from "zod";
import { ValidationError } from "@marketing-os/core";
import type { AppContext } from "../context";

const uuid = z.string().uuid();

export async function parseBody<S extends z.ZodType>(
  c: AppContext,
  schema: S,
): Promise<z.infer<S>> {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new ValidationError("Invalid request body", parsed.error.flatten());
  return parsed.data;
}

export function parseUuidParam(c: AppContext, name: string): string {
  const parsed = uuid.safeParse(c.req.param(name));
  if (!parsed.success) throw new ValidationError(`Invalid ${name}`);
  return parsed.data;
}
