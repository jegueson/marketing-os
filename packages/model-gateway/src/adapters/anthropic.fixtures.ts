/** Recorded Anthropic Messages API payloads. Tests never call the live API. */

export const ANTHROPIC_CHAT_MODEL = "claude-3-5-haiku-20241022";
export const ANTHROPIC_TEST_KEY = "sk-ant-api03-test-key-not-real";
export const ANTHROPIC_VERSION = "2023-06-01";

export const anthropicModelsFixture = {
  data: [
    { id: ANTHROPIC_CHAT_MODEL, display_name: "Claude 3.5 Haiku", type: "model" },
    { id: "claude-3-5-sonnet-20241022", display_name: "Claude 3.5 Sonnet", type: "model" },
  ],
};

export const anthropicCompleteFixture = {
  id: "msg_test_complete",
  type: "message",
  role: "assistant",
  model: ANTHROPIC_CHAT_MODEL,
  content: [{ type: "text", text: "Hello from Anthropic fixture." }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 12, output_tokens: 9 },
};

/** Forced tool-use response for json_schema structured output. */
export const anthropicToolCompleteFixture = {
  id: "msg_test_tool",
  type: "message",
  role: "assistant",
  model: ANTHROPIC_CHAT_MODEL,
  content: [
    {
      type: "tool_use",
      id: "toolu_01",
      name: "emit_result",
      input: { intent: "answerable", steps: [] },
    },
  ],
  stop_reason: "tool_use",
  stop_sequence: null,
  usage: { input_tokens: 20, output_tokens: 15 },
};

/** Streaming tool_use path used when responseFormat forces emit_result. */
export const anthropicToolStreamBody = [
  `event: message_start`,
  `data: ${JSON.stringify({
    type: "message_start",
    message: {
      id: "msg_tool_stream",
      type: "message",
      role: "assistant",
      model: ANTHROPIC_CHAT_MODEL,
      content: [],
      stop_reason: null,
      usage: { input_tokens: 8, output_tokens: 0 },
    },
  })}`,
  "",
  `event: content_block_start`,
  `data: ${JSON.stringify({
    type: "content_block_start",
    index: 0,
    content_block: { type: "tool_use", id: "toolu_stream", name: "emit_result", input: {} },
  })}`,
  "",
  `event: content_block_delta`,
  `data: ${JSON.stringify({
    type: "content_block_delta",
    index: 0,
    delta: { type: "input_json_delta", partial_json: '{"intent":"' },
  })}`,
  "",
  `event: content_block_delta`,
  `data: ${JSON.stringify({
    type: "content_block_delta",
    index: 0,
    delta: { type: "input_json_delta", partial_json: 'answerable"}' },
  })}`,
  "",
  `event: content_block_stop`,
  `data: ${JSON.stringify({ type: "content_block_stop", index: 0 })}`,
  "",
  `event: message_delta`,
  `data: ${JSON.stringify({
    type: "message_delta",
    delta: { stop_reason: "tool_use", stop_sequence: null },
    usage: { output_tokens: 6 },
  })}`,
  "",
  `event: message_stop`,
  `data: ${JSON.stringify({ type: "message_stop" })}`,
  "",
  "",
].join("\n");

export const anthropicStreamBody = [
  `event: message_start`,
  `data: ${JSON.stringify({
    type: "message_start",
    message: {
      id: "msg_stream",
      type: "message",
      role: "assistant",
      model: ANTHROPIC_CHAT_MODEL,
      content: [],
      stop_reason: null,
      usage: { input_tokens: 5, output_tokens: 0 },
    },
  })}`,
  "",
  `event: content_block_start`,
  `data: ${JSON.stringify({
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "" },
  })}`,
  "",
  `event: content_block_delta`,
  `data: ${JSON.stringify({
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "Hel" },
  })}`,
  "",
  `event: content_block_delta`,
  `data: ${JSON.stringify({
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "lo" },
  })}`,
  "",
  `event: content_block_stop`,
  `data: ${JSON.stringify({ type: "content_block_stop", index: 0 })}`,
  "",
  `event: message_delta`,
  `data: ${JSON.stringify({
    type: "message_delta",
    delta: { stop_reason: "end_turn", stop_sequence: null },
    usage: { output_tokens: 2 },
  })}`,
  "",
  `event: message_stop`,
  `data: ${JSON.stringify({ type: "message_stop" })}`,
  "",
  "",
].join("\n");

export function recordedAnthropicFetch(options?: {
  onRequest?: (url: string, init?: RequestInit) => void;
  status?: number;
  body?: string;
}): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    options?.onRequest?.(url.toString(), init);

    if (options?.status) {
      return new Response(options.body ?? JSON.stringify({ error: { message: "nope", type: "error" } }), {
        status: options.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!url.href.startsWith("https://api.anthropic.com/v1")) {
      return new Response("wrong host", { status: 404 });
    }

    if (url.pathname.endsWith("/models") && (!init?.method || init.method === "GET")) {
      return Response.json(anthropicModelsFixture);
    }

    if (url.pathname.endsWith("/messages") && init?.method === "POST") {
      const body = JSON.parse(String(init.body ?? "{}")) as {
        stream?: boolean;
        tools?: unknown[];
        system?: string;
      };
      if (body.stream) {
        const streamBody =
          body.tools && Array.isArray(body.tools) && body.tools.length > 0
            ? anthropicToolStreamBody
            : anthropicStreamBody;
        return new Response(streamBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      if (body.tools && Array.isArray(body.tools) && body.tools.length > 0) {
        return Response.json(anthropicToolCompleteFixture);
      }
      return Response.json(anthropicCompleteFixture);
    }

    return new Response("not found", { status: 404 });
  };
}
