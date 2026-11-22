import { describe, expect, it, vi } from "vitest";
import { NoopBillingProvider, withBudget, type BudgetSnapshot } from "./billing";
import { FakeGateway } from "./fake";

const tenantId = "11111111-1111-4111-8111-111111111111";
const model = {
  id: "gpt-test",
  displayName: "GPT Test",
  provider: "openai_compatible" as const,
  inputPriceMicroUsdPer1M: 1_000_000,
  outputPriceMicroUsdPer1M: 2_000_000,
};

function gateway() {
  return new FakeGateway({
    models: [model],
    completeScripts: [{ content: "hi" }],
    streamScripts: [{ deltas: ["a"] }],
    embedScripts: [{ embeddings: [[0.1]] }],
  });
}

function lookup(snapshot: BudgetSnapshot) {
  return async () => snapshot;
}

const request = { model: model.id, messages: [{ role: "user" as const, content: "x" }] };

describe("NoopBillingProvider", () => {
  it("boots with no payment configuration", () => {
    expect(new NoopBillingProvider()).toBeInstanceOf(NoopBillingProvider);
  });

  it("does not call the provider when a hard cap is already spent", async () => {
    const fake = gateway();
    const billing = new NoopBillingProvider();
    const record = vi.spyOn(billing, "record");
    const wrapped = withBudget(
      fake,
      billing,
      lookup({ budget: { monthlyCapMicroUsd: 100, enforcement: "hard" }, monthSpendMicroUsd: 100 }),
      tenantId,
    );
    await expect(wrapped.complete(request)).rejects.toMatchObject({ code: "budget_exceeded" });
    expect(fake.calls.complete).toHaveLength(0);
    expect(record).not.toHaveBeenCalled();
  });

  it("allows a warn cap that is already spent", async () => {
    const fake = gateway();
    const wrapped = withBudget(
      fake,
      new NoopBillingProvider(),
      lookup({ budget: { monthlyCapMicroUsd: 100, enforcement: "warn" }, monthSpendMicroUsd: 250 }),
      tenantId,
    );
    await wrapped.complete(request);
    expect(fake.calls.complete).toHaveLength(1);
  });

  it("allows a hard cap that still has room", async () => {
    const fake = gateway();
    const wrapped = withBudget(
      fake,
      new NoopBillingProvider(),
      lookup({ budget: { monthlyCapMicroUsd: 100, enforcement: "hard" }, monthSpendMicroUsd: 99 }),
      tenantId,
    );
    await wrapped.complete(request);
    expect(fake.calls.complete).toHaveLength(1);
  });

  it("blocks stream and embed at a hard cap before the provider runs", async () => {
    const fake = gateway();
    const wrapped = withBudget(
      fake,
      new NoopBillingProvider(),
      lookup({ budget: { monthlyCapMicroUsd: 1, enforcement: "hard" }, monthSpendMicroUsd: 1 }),
      tenantId,
    );
    await expect(async () => {
      for await (const _chunk of wrapped.stream(request)) {
        // should not yield
      }
    }).rejects.toMatchObject({ code: "budget_exceeded" });
    await expect(wrapped.embed({ model: model.id, input: "x" })).rejects.toMatchObject({
      code: "budget_exceeded",
    });
    expect(fake.calls.stream).toHaveLength(0);
    expect(fake.calls.embed).toHaveLength(0);
  });
});
