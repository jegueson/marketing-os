import { describe, expect, it } from "vitest";
import { runGatewayContract } from "../contract";
import { ModelGatewayError } from "../errors";
import { OpenRouterGateway } from "./openrouter";
import {
  OPENROUTER_CHAT_MODEL,
  OPENROUTER_EMBED_MODEL,
  OPENROUTER_TEST_KEY,
  recordedOpenRouterFetch,
  statusFetch,
} from "./openrouter.fixtures";

function gateway(fetchImpl: typeof fetch = recordedOpenRouterFetch()) {
  return new OpenRouterGateway({ apiKey: OPENROUTER_TEST_KEY, fetch: fetchImpl });
}

describe("OpenRouterGateway", () => {
  it("passes the contract kit against recorded fixtures", async () => {
    await expect(runGatewayContract(gateway())).resolves.toBeUndefined();
  });

  it("lists models with pricing and null for unknown prices", async () => {
    const models = await gateway().listModels();
    const chat = models.find((m) => m.id === OPENROUTER_CHAT_MODEL);
    const mystery = models.find((m) => m.id === "local/mystery");
    expect(chat?.inputPriceMicroUsdPer1M).toBeGreaterThan(0);
    expect(mystery?.inputPriceMicroUsdPer1M).toBeNull();
    expect(await gateway().estimateCost("local/mystery", 100, 50)).toMatchObject({
      estimatedCostMicroUsd: null,
      costBasis: "unknown",
    });
  });

  it("completes and streams from fixtures", async () => {
    const complete = await gateway().complete({
      model: OPENROUTER_CHAT_MODEL,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(complete.content).toContain("Hello");
    expect(complete.usage.inputTokens).toBe(12);

    const parts: string[] = [];
    for await (const chunk of gateway().stream({
      model: OPENROUTER_CHAT_MODEL,
      messages: [{ role: "user", content: "hi" }],
    })) {
      if (chunk.type === "delta") parts.push(chunk.text);
      if (chunk.type === "done") {
        expect(chunk.usage.outputTokens).toBe(2);
        expect(chunk.finishReason).toBe("stop");
      }
    }
    expect(parts.join("")).toBe("Hello");
  });

  it("embeds with a supported model and refuses chat models", async () => {
    const embedded = await gateway().embed({ model: OPENROUTER_EMBED_MODEL, input: "hi" });
    expect(embedded.embeddings[0]).toEqual([0.1, -0.2, 0.3]);
    await expect(gateway().embed({ model: OPENROUTER_CHAT_MODEL, input: "hi" })).rejects.toMatchObject({
      code: "unsupported_capability",
    });
  });

  it.each([
    [401, "auth_failed"],
    [402, "budget_exceeded"],
    [429, "rate_limited"],
    [503, "provider_unavailable"],
  ] as const)("maps HTTP %i to %s", async (status, code) => {
    const err = await gateway(statusFetch(status, JSON.stringify({ error: { message: "nope" } })))
      .listModels()
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(ModelGatewayError);
    expect((err as ModelGatewayError).code).toBe(code);
  });

  it("never puts the API key into error messages", async () => {
    const plainKey = "plainkey-not-sk-shaped-123456";
    const err = await new OpenRouterGateway({
      apiKey: plainKey,
      fetch: statusFetch(503, JSON.stringify({ error: { message: `upstream echo ${plainKey}` } })),
    })
      .listModels()
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(ModelGatewayError);
    expect((err as ModelGatewayError).message).not.toContain(plainKey);
    expect((err as ModelGatewayError).message).toContain("[redacted]");
  });

  it("maps in-band provider error codes the same as HTTP statuses", async () => {
    const fetchImpl: typeof fetch = async () =>
      Response.json({
        id: "gen-err",
        choices: [],
        error: { code: 402, message: "Insufficient credits" },
      });
    await expect(
      gateway(fetchImpl).complete({
        model: OPENROUTER_CHAT_MODEL,
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toMatchObject({ code: "budget_exceeded" });
  });

  it("fails fast when the abort signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      gateway().complete({
        model: OPENROUTER_CHAT_MODEL,
        messages: [{ role: "user", content: "hi" }],
        abortSignal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(ModelGatewayError);
  });

  it("stops a stream when the signal aborts after the first delta", async () => {
    const controller = new AbortController();
    let pulls = 0;
    const fetchImpl: typeof fetch = async () => {
      const stream = new ReadableStream<Uint8Array>({
        pull(ctrl) {
          pulls += 1;
          const encode = (obj: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
          if (pulls === 1) {
            ctrl.enqueue(
              encode({
                id: "gen-abort",
                object: "chat.completion.chunk",
                created: 1,
                model: OPENROUTER_CHAT_MODEL,
                choices: [{ index: 0, delta: { content: "A" }, finish_reason: null }],
              }),
            );
            return;
          }
          ctrl.enqueue(
            encode({
              id: "gen-abort",
              object: "chat.completion.chunk",
              created: 1,
              model: OPENROUTER_CHAT_MODEL,
              choices: [{ index: 0, delta: { content: "B" }, finish_reason: null }],
            }),
          );
        },
      });
      return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    };
    const parts: string[] = [];
    await expect(async () => {
      for await (const chunk of gateway(fetchImpl).stream({
        model: OPENROUTER_CHAT_MODEL,
        messages: [{ role: "user", content: "hi" }],
        abortSignal: controller.signal,
      })) {
        if (chunk.type === "delta") {
          parts.push(chunk.text);
          controller.abort();
        }
      }
    }).rejects.toThrow();
    expect(parts).toEqual(["A"]);
  });

  it("sends Authorization but does not echo the key in request-captured errors", async () => {
    let auth: string | null = null;
    const fetchImpl = recordedOpenRouterFetch({
      onRequest: (_url, init) => {
        const headers = new Headers(init?.headers);
        auth = headers.get("Authorization");
      },
    });
    await gateway(fetchImpl).complete({
      model: OPENROUTER_CHAT_MODEL,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(auth).toBe(`Bearer ${OPENROUTER_TEST_KEY}`);
  });
});
