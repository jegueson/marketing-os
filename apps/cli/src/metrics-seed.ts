import { isNull } from "drizzle-orm";
import { loadMetricsYaml } from "@marketing-os/metrics";
import { metricDefinitions, type Database } from "@marketing-os/db";

/** Inserts platform catalog rows that are not already present. Tenant overrides are left alone. */
export async function seedPlatformMetrics(db: Database, yamlPath: string): Promise<number> {
  const document = loadMetricsYaml(yamlPath);
  const existing = await db
    .select({ key: metricDefinitions.key })
    .from(metricDefinitions)
    .where(isNull(metricDefinitions.tenantId));
  const present = new Set(existing.map((row) => row.key));
  const missing = document.definitions.filter((definition) => !present.has(definition.key));
  if (missing.length === 0) return 0;
  await db.insert(metricDefinitions).values(
    missing.map((definition) => ({
      key: definition.key,
      source: definition.source,
      version: definition.version,
      label: definition.label,
      unit: definition.unit ?? null,
      formula: definition.formula ?? null,
      target: definition.target == null ? null : String(definition.target),
      widgets: definition.widgets ?? [],
    })),
  );
  return missing.length;
}
