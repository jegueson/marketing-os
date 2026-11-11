import { describe, expect, it } from "vitest";
import { deriveDataHealth, planBackfillWindows, planSyncJobs, rateLimitBackoffMs, assessDataHealth } from "./scheduler";

describe("scheduler and data health", () => {
  it("plans due sync jobs", () => {
    const jobs = planSyncJobs(
      [
        {
          id: "11111111-1111-4111-8111-111111111111",
          tenantId: "22222222-2222-4222-8222-222222222222",
          workspaceId: "33333333-3333-4333-8333-333333333333",
          connectorSlug: "mock",
          nextSyncAt: new Date(0).toISOString(),
        },
      ],
      new Date(),
    );
    expect(jobs).toHaveLength(1);
  });

  it("splits a 90-day backfill into 30-day chunks and backs off rate limits", () => {
    const windows = planBackfillWindows(new Date("2026-04-01T15:00:00.000Z"));
    expect(windows).toHaveLength(3);
    expect(windows[0]?.start).toBe("2026-01-01T00:00:00.000Z");
    expect(windows[2]?.end).toBe("2026-04-01T00:00:00.000Z");
    expect(rateLimitBackoffMs(0)).toBe(1000);
    expect(rateLimitBackoffMs(3)).toBe(8000);
    expect(rateLimitBackoffMs(10)).toBe(60_000);
  });
  it("derives stale health", () => {
    const health = deriveDataHealth({
      connectionId: "c1",
      lastSuccessAt: new Date(0).toISOString(),
      lastErrorAt: null,
      staleAfterSeconds: 60,
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(health.status).toBe("stale");
    expect(health.dimensions.freshness).toBe("stale");
  });

  it("reports volume, schema, and permission failures", () => {
    const now = new Date("2026-11-11T00:00:00.000Z");
    const fresh = now.toISOString();
    expect(
      assessDataHealth({
        connectionId: "c1",
        lastSuccessAt: fresh,
        lastErrorAt: null,
        staleAfterSeconds: 86_400,
        recordCount: 0,
        now,
      }).dimensions.volume,
    ).toBe("error");
    const schema = assessDataHealth({
      connectionId: "c1",
      lastSuccessAt: fresh,
      lastErrorAt: null,
      staleAfterSeconds: 86_400,
      schemaState: "mismatch",
      now,
    });
    expect(schema.status).toBe("error");
    expect(schema.dimensions.schema).toBe("error");
    const permission = assessDataHealth({
      connectionId: "c1",
      lastSuccessAt: null,
      lastErrorAt: fresh,
      staleAfterSeconds: 86_400,
      issues: [{ code: "permission_changed", message: "Access changed" }],
      now,
    });
    expect(permission.status).toBe("error");
    expect(permission.dimensions.permissions).toBe("error");
    expect(permission.issues[0]?.message).toBe("Access changed");
    expect(
      assessDataHealth({
        connectionId: "c1",
        lastSuccessAt: null,
        lastErrorAt: null,
        staleAfterSeconds: 86_400,
        now,
      }).status,
    ).toBe("never_synced");
  });
});
