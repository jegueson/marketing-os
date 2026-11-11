import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { loadMetricsYaml, type MetricDefinition } from "@marketing-os/metrics";
import { withContext } from "./context";
import { metricDefinitions, metricValues, tenants, workspaces } from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";

const templatePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../customer-configs/_templates/metrics.yaml",
);

let t: TestDatabase;
const tenantA = crypto.randomUUID();
const tenantB = crypto.randomUUID();
const userA = crypto.randomUUID();
const userB = crypto.randomUUID();

function isRlsDenial(err: unknown): boolean {
  const cause = (err as { cause?: { message?: string } }).cause;
  return /row-level security/.test(cause?.message ?? (err as Error).message ?? "");
}

beforeAll(async () => {
  t = await createTestDatabase();
  await t.createUser("metrics-a@example.com", userA);
  await t.createUser("metrics-b@example.com", userB);
  await t.db.insert(tenants).values([
    { id: tenantA, slug: "metrics-a", name: "Metrics A" },
    { id: tenantB, slug: "metrics-b", name: "Metrics B" },
  ]);
  await t.db.insert(workspaces).values([
    { tenantId: tenantA, slug: "default", name: "Default" },
    { tenantId: tenantB, slug: "default", name: "Default" },
  ]);
  const doc = loadMetricsYaml(templatePath);
  await t.db.insert(metricDefinitions).values(
    doc.definitions.map((definition) => ({
      key: definition.key,
      source: definition.source,
      version: definition.version,
      label: definition.label,
      unit: definition.unit ?? null,
      formula: definition.formula ?? null,
    })),
  );
}, 60_000);

afterAll(async () => {
  await t.close();
});

describe("metric catalog import", () => {
  it("loads the platform catalog from metrics.yaml", async () => {
    const rows = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(metricDefinitions),
    );
    expect(rows.some((row) => row.key === "LeadCAC" && row.tenantId === null)).toBe(true);
    expect(rows.some((row) => row.key === "QualifiedLeadCAC")).toBe(true);
  });

  it("stores a tenant override without replacing the platform row", async () => {
    const override: MetricDefinition = {
      key: "LeadCAC",
      source: "formula",
      version: "1",
      label: "Lead CAC (tenant)",
      formula: { op: "ratio", numerator: "Spend", denominator: "QualifiedLeads" },
    };
    await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.insert(metricDefinitions).values({
        tenantId: tenantA,
        key: override.key,
        source: override.source,
        version: override.version,
        label: override.label,
        formula: override.formula,
      }),
    );
    const own = await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.select().from(metricDefinitions).where(eq(metricDefinitions.key, "LeadCAC")),
    );
    expect(own).toHaveLength(2);
    const other = await withContext(t.db, { tenantId: tenantB, userId: userB, staff: false }, (tx) =>
      tx.select().from(metricDefinitions).where(eq(metricDefinitions.key, "LeadCAC")),
    );
    expect(other.map((row) => row.tenantId)).toEqual([null]);
  });

  it("rejects a metric value with an empty definition version and hides other tenants", async () => {
    await expect(
      t.db.insert(metricValues).values({
        tenantId: tenantA,
        definitionKey: "Spend",
        definitionVersion: "",
        periodStart: new Date("2026-10-01T00:00:00.000Z"),
        periodEnd: new Date("2026-11-01T00:00:00.000Z"),
        dimensionHash: "all",
        value: "100",
        fetchedAt: new Date("2026-11-11T00:00:00.000Z"),
      }),
    ).rejects.toSatisfy((err: unknown) => {
      const cause = (err as { cause?: { message?: string } }).cause?.message ?? "";
      return /metric_values_version_present|check constraint/i.test(cause);
    });

    await withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
      tx.insert(metricValues).values({
        tenantId: tenantA,
        definitionKey: "Spend",
        definitionVersion: "1",
        periodStart: new Date("2026-10-01T00:00:00.000Z"),
        periodEnd: new Date("2026-11-01T00:00:00.000Z"),
        dimensionHash: "all",
        value: "100",
        fetchedAt: new Date("2026-11-11T00:00:00.000Z"),
      }),
    );
    const hidden = await withContext(t.db, { tenantId: tenantB, userId: userB, staff: false }, (tx) =>
      tx.select().from(metricValues),
    );
    expect(hidden).toEqual([]);
    await expect(
      withContext(t.db, { tenantId: tenantA, userId: userA, staff: false }, (tx) =>
        tx.insert(metricDefinitions).values({
          tenantId: tenantB,
          key: "Spend",
          source: "formula",
          version: "1",
          label: "Stolen",
        }),
      ),
    ).rejects.toSatisfy(isRlsDenial);
  });
});
