import type { Connector } from "@marketing-os/connector-sdk";
import type { ToolCatalogEntry } from "@marketing-os/db";

/**
 * Union of `listTools` across the registered connectors.
 * Publish uses this catalog; draft saves do not.
 * Current connectors ignore credentials for `listTools`, so a stub context is enough.
 * A connector that later needs a live connection must fail closed here, not invent tools.
 */
export async function loadToolCatalog(
  connectors: ReadonlyMap<string, Connector>,
  tenantId: string,
  workspaceId: string,
): Promise<ToolCatalogEntry[]> {
  const stub = {
    tenantId,
    workspaceId,
    connectionId: "00000000-0000-4000-8000-000000000000",
    credentials: {},
  };
  const entries: ToolCatalogEntry[] = [];
  for (const [slug, connector] of connectors) {
    const tools = await connector.listTools(stub);
    for (const tool of tools) {
      entries.push({ connector: slug, tool: tool.name });
    }
  }
  return entries;
}
