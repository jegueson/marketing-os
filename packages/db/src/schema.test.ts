import { describe, expect, it } from "vitest";
import {
  auditEvents,
  connections,
  leads,
  modelCredentials,
  tenantModelConfig,
  tenants,
  modelBudgets,
  askConversations,
  usageLedger,
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

  it("exports Sprint 3 model credential tables", () => {
    expect(tenantModelConfig).toBeDefined();
    expect(modelCredentials).toBeDefined();
  });

  it("exports the usage ledger table", () => {
    expect(usageLedger).toBeDefined();
  });

  it("exports the model budget table", () => {
    expect(modelBudgets).toBeDefined();
  });

  it("exports ask conversation tables", () => {
    expect(askConversations).toBeDefined();
  });
});
