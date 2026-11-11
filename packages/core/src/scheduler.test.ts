import { describe, expect, it } from "vitest";
import { deriveDataHealth, planSyncJobs } from "./scheduler";

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

  it("derives stale health", () => {
    const health = deriveDataHealth({
      connectionId: "c1",
      lastSuccessAt: new Date(0).toISOString(),
      lastErrorAt: null,
      staleAfterSeconds: 60,
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(health.status).toBe("stale");
  });
});
