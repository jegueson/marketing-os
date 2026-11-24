import { and, eq } from "drizzle-orm";
import type { Database } from "./context";
import { tenantPrompts } from "./schema/prompts";

export type StoredTenantPrompt = {
  name: string;
  version: string;
  purpose: string;
  system: string;
  contentHash: string;
  model: {
    structuredOutput: "json_schema" | "json_object" | "none";
    temperatureMax: number;
    minContextWindow: number;
  };
};

/** Rows the PromptSource adapter hashes and renders. Append-only. */
export async function listTenantPrompts(
  tx: Database,
  input: { tenantId: string; workspaceId: string },
): Promise<StoredTenantPrompt[]> {
  const rows = await tx
    .select({
      name: tenantPrompts.name,
      version: tenantPrompts.version,
      purpose: tenantPrompts.purpose,
      system: tenantPrompts.system,
      contentHash: tenantPrompts.contentHash,
      model: tenantPrompts.model,
    })
    .from(tenantPrompts)
    .where(
      and(eq(tenantPrompts.tenantId, input.tenantId), eq(tenantPrompts.workspaceId, input.workspaceId)),
    );
  return rows;
}

export async function insertTenantPrompt(
  tx: Database,
  input: {
    tenantId: string;
    workspaceId: string;
    prompt: StoredTenantPrompt;
  },
): Promise<void> {
  await tx.insert(tenantPrompts).values({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    name: input.prompt.name,
    version: input.prompt.version,
    purpose: input.prompt.purpose,
    system: input.prompt.system,
    contentHash: input.prompt.contentHash,
    model: input.prompt.model,
  });
}
