import { describe, expect, it } from "vitest";
import {
  auditEvents,
  connections,
  leads,
  tenants,
  workspaces,
} from "./schema";

describe("schema", () => {
  it("exports core Sprint 1 tables", () => {
    expect(tenants).toBeDefined();
    expect(workspaces).toBeDefined();
    expect(leads).toBeDefined();
    expect(connections).toBeDefined();
    expect(auditEvents).toBeDefined();
  });
});
