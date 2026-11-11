import { z } from "zod";

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

const successSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
  error: z.null(),
  meta: z.record(z.string(), z.unknown()).nullable(),
});

const failureSchema = z.object({
  success: z.literal(false),
  data: z.null(),
  error: errorSchema,
  meta: z.null(),
});

export const envelopeSchema = z.union([successSchema, failureSchema]);

export type Envelope<T = unknown> =
  | { success: true; data: T; error: null; meta: Record<string, unknown> | null }
  | {
      success: false;
      data: null;
      error: { code: string; message: string; details?: unknown };
      meta: null;
    };

/** Validates the API response envelope. Throws when the payload is not an envelope. */
export function parseEnvelope(payload: unknown): Envelope {
  const parsed = envelopeSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Invalid API envelope: ${parsed.error.message}`);
  }
  return parsed.data as Envelope;
}
