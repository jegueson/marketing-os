import { describe, expect, it } from "vitest";
import { runGatewayContract } from "../contract";
import { ModelGatewayError } from "../errors";
import { AnthropicGateway, ANTHROPIC_BASE_URL } from "./anthropic";
import {
  ANTHROPIC_CHAT_MODEL,
  ANTHROPIC_TEST_KEY,
  ANTHROPIC_VERSION,
  recordedAnthropicFetch,
} from "./anthropic.fixtures";

function gateway(fetchImpl: typeof fetch = recordedAnthropicFetch()) {
  return new AnthropicGateway({ apiKey: ANTHROPIC_TEST_KEY, fetch: fetchImpl });
}

describe("AnthropicGateway", () => {
  it("passes the contract kit against recorded fixtures", async () => {
    await expect(runGatewayContract(gateway())).resolves.toBeUndefined();
  });

  it("maps system messages to the top-level system field", async () => {
    const captured: { body?: Record<string, unknown> } = {};
    const fetchImpl = recordedAnthropicFetch({
      onRequest: (_url, init) => {
        if (init?.method === "POST") {
          captured.body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        }
      },
    });
    await gateway(fetchImpl).complete({
      model: ANTHROPIC_CHAT_MODEL,
      messages: [
        { role: "system", content: "You are concise." },
        { role: "user", content: "Hi" },
      ],
    });
    expect(captured.body?.system).toBe("You are concise.");
    expect(captured.body?.messages).toEqual([{ role: "user", content: "Hi" }]);
  });

  it("streams text_delta events into gateway deltas", async () => {
    const parts: string[] = [];
    for await (const chunk of gateway().stream({
      model: ANTHROPIC_CHAT_MODEL,
      messages: [{ role: "user", content: "hi" }],
    })) {
      if (chunk.type === "delta") parts.push(chunk.text);
      if (chunk.type === "done") {
        expect(chunk.finishReason).toBe("stop");
        expect(chunk.usage.outputTokens).toBe(2);
      }
    }
    expect(parts.join("")).toBe("Hello");
  });

  it("streams input_json_delta for structured json_schema", async () => {
    const parts: string[] = [];
    for await (const chunk of gateway().stream({
      model: ANTHROPIC_CHAT_MODEL,
      messages: [{ role: "user", content: "plan" }],
      responseFormat: {
        type: "json_schema",
        name: "plan",
        schema: { type: "object", properties: { intent: { type: "string" } } },
      },
    })) {
      if (chunk.type === "delta") parts.push(chunk.text);
      if (chunk.type === "done") {
        expect(chunk.finishReason).toBe("stop");
        expect(chunk.usage.outputTokens).toBe(6);
      }
    }
    expect(parts.join("")).toBe('{"intent":"answerable"}');
  });

  it("uses tool_use for structured json_schema output", async () => {
    const captured: { body?: Record<string, unknown> } = {};
    const fetchImpl = recordedAnthropicFetch({
      onRequest: (_url, init) => {
        if (init?.method === "POST") {
          captured.body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        }
      },
    });
    const result = await gateway(fetchImpl).complete({
      model: ANTHROPIC_CHAT_MODEL,
      messages: [{ role: "user", content: "plan" }],
      responseFormat: {
        type: "json_schema",
        name: "plan",
        schema: { type: "object", properties: { intent: { type: "string" } } },
      },
    });
    expect(captured.body?.tool_choice).toEqual({ type: "tool", name: "emit_result" });
    expect(result.content).toContain("answerable");
  });

  it("rejects embed with unsupported_capability", async () => {
    await expect(gateway().embed({ model: ANTHROPIC_CHAT_MODEL, input: "hi" })).rejects.toMatchObject({
      code: "unsupported_capability",
    });
  });

  it.each([
    [401, "auth_failed"],
    [429, "rate_limited"],
  ] as const)("maps HTTP %i to %s", async (status, code) => {
    await expect(gateway(recordedAnthropicFetch({ status })).listModels()).rejects.toMatchObject({ code });
  });

  it("sends x-api-key and anthropic-version, never Authorization bearer", async () => {
    let headers: Headers | null = null;
    const fetchImpl = recordedAnthropicFetch({
      onRequest: (_url, init) => {
        headers = new Headers(init?.headers);
      },
    });
    await gateway(fetchImpl).complete({
      model: ANTHROPIC_CHAT_MODEL,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(headers!.get("x-api-key")).toBe(ANTHROPIC_TEST_KEY);
    expect(headers!.get("anthropic-version")).toBe(ANTHROPIC_VERSION);
    expect(headers!.get("Authorization")).toBeNull();
  });

  it("locks the base URL and reports provider anthropic", () => {
    const adapter = gateway();
    expect(adapter.baseUrl).toBe(ANTHROPIC_BASE_URL);
    expect(adapter.provider).toBe("anthropic");
  });

  it("never puts the API key into error messages", async () => {
    const err = await gateway(
      recordedAnthropicFetch({
        status: 401,
        body: JSON.stringify({ error: { message: `bad key ${ANTHROPIC_TEST_KEY}` } }),
      }),
    )
      .listModels()
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(ModelGatewayError);
    expect((err as ModelGatewayError).message).not.toContain(ANTHROPIC_TEST_KEY);
  });
});
