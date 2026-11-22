import { describe, expect, it } from "vitest";
import { ModelGatewayError } from "./errors";
import { FakeGateway } from "./fake";
import { InMemoryUsageSink, withLedger } from "./ledger";

const model = {
  id: "gpt-test",
  displayName: "GPT Test",
  provider: "openai_compatible" as const,
  inputPriceMicroUsdPer1M: 1_000_000,
  outputPriceMicroUsdPer1M: 2_000_000,
};

function gateway(scripts?: {
  complete?: { content: string }[];
  stream?: { deltas: string[] }[];
  embed?: { embeddings: number[][] }[];
  failComplete?: boolean;
  failStream?: boolean;
}) {
  const fake = new FakeGateway({
    models: [model],
    completeScripts: scripts?.complete ?? [{ content: "hi" }],
    streamScripts: scripts?.stream ?? [{ deltas: ["a", "b"] }],
    embedScripts: scripts?.embed ?? [{ embeddings: [[0.1, 0.2]] }],
  });
  if (scripts?.failComplete) {
    fake.complete = async () => {
      throw new ModelGatewayError("nope", "auth_failed");
    };
  }
  if (scripts?.failStream) {
    fake.stream = async function* () {
      yield { type: "delta", text: "x" };
      throw new ModelGatewayError("boom", "provider_unavailable", true);
    };
  }
  return fake;
}

const ctx = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  userId: "33333333-3333-4333-8333-333333333333",
  purpose: "ask",
  promptName: "ask.plan",
  promptVersion: "1",
};

describe("withLedger", () => {
  it("writes exactly one row for a successful complete", async () => {
    const sink = new InMemoryUsageSink();
    const wrapped = withLedger(gateway(), sink, ctx);
    await wrapped.complete({ model: model.id, messages: [{ role: "user", content: "secret prompt body" }] });
    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0]).toMatchObject({
      purpose: "ask",
      model: model.id,
      status: "ok",
      promptName: "ask.plan",
      promptVersion: "1",
      costBasis: "provider_list",
    });
    expect(JSON.stringify(sink.entries)).not.toContain("secret prompt body");
  });

  it("still writes when complete fails", async () => {
    const sink = new InMemoryUsageSink();
    const wrapped = withLedger(gateway({ failComplete: true }), sink, ctx);
    await expect(
      wrapped.complete({ model: model.id, messages: [{ role: "user", content: "x" }] }),
    ).rejects.toMatchObject({ code: "auth_failed" });
    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0]).toMatchObject({ status: "error", errorCode: "auth_failed" });
  });

  it("writes one row for a completed stream", async () => {
    const sink = new InMemoryUsageSink();
    const wrapped = withLedger(gateway(), sink, ctx);
    const parts: string[] = [];
    for await (const chunk of wrapped.stream({
      model: model.id,
      messages: [{ role: "user", content: "stream me" }],
    })) {
      if (chunk.type === "delta") parts.push(chunk.text);
    }
    expect(parts.join("")).toBe("ab");
    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0]?.status).toBe("ok");
  });

  it("writes aborted when the stream ends without done", async () => {
    const sink = new InMemoryUsageSink();
    const truncated = gateway();
    truncated.stream = async function* () {
      yield { type: "delta", text: "only" };
    };
    const wrapped = withLedger(truncated, sink, ctx);
    for await (const _chunk of wrapped.stream({
      model: model.id,
      messages: [{ role: "user", content: "x" }],
    })) {
      // consume all deltas; no done chunk follows
    }
    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0]).toMatchObject({ status: "aborted", errorCode: "aborted" });
  });

  it("writes when stream throws mid-flight", async () => {
    const sink = new InMemoryUsageSink();
    const wrapped = withLedger(gateway({ failStream: true }), sink, ctx);
    await expect(async () => {
      for await (const _ of wrapped.stream({
        model: model.id,
        messages: [{ role: "user", content: "x" }],
      })) {
        // drain
      }
    }).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0]).toMatchObject({ status: "error", errorCode: "provider_unavailable" });
  });

  it("writes exactly one row for embed", async () => {
    const sink = new InMemoryUsageSink();
    const wrapped = withLedger(gateway(), sink, ctx);
    await wrapped.embed({ model: model.id, input: "embed this secret" });
    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0]?.status).toBe("ok");
    expect(JSON.stringify(sink.entries)).not.toContain("embed this secret");
  });

  it("does not ledger listModels", async () => {
    const sink = new InMemoryUsageSink();
    const wrapped = withLedger(gateway(), sink, ctx);
    await wrapped.listModels();
    expect(sink.entries).toHaveLength(0);
  });

  it("keeps the gateway error when the sink fails", async () => {
    const sink: InMemoryUsageSink = {
      entries: [],
      async record() {
        throw new Error("ledger down");
      },
    };
    const wrapped = withLedger(gateway({ failComplete: true }), sink, ctx);
    await expect(
      wrapped.complete({ model: model.id, messages: [{ role: "user", content: "x" }] }),
    ).rejects.toMatchObject({ code: "auth_failed" });
  });
});
