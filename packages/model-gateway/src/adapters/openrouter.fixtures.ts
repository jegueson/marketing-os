/** Recorded OpenRouter payloads. Tests never call the live API. */

export const OPENROUTER_CHAT_MODEL = "openai/gpt-4o-mini";
export const OPENROUTER_EMBED_MODEL = "openai/text-embedding-3-small";
export const OPENROUTER_TEST_KEY = "sk-or-v1-test-key-not-real-do-not-use";

export const modelsFixture = {
  data: [
    {
      id: OPENROUTER_CHAT_MODEL,
      name: "GPT-4o Mini",
      context_length: 128_000,
      pricing: { prompt: "0.00000015", completion: "0.0000006" },
      architecture: {
        modality: "text->text",
        input_modalities: ["text"],
        output_modalities: ["text"],
      },
      supported_parameters: ["tools", "temperature", "max_tokens", "response_format", "structured_outputs"],
    },
    {
      id: OPENROUTER_EMBED_MODEL,
      name: "Text Embedding 3 Small",
      context_length: 8_191,
      pricing: { prompt: "0.00000002", completion: "0" },
      architecture: {
        modality: "text->text",
        input_modalities: ["text"],
        output_modalities: ["embeddings"],
      },
      supported_parameters: [],
    },
    {
      id: "local/mystery",
      name: "Mystery",
      context_length: 4_096,
      pricing: { prompt: "-1", completion: "-1" },
      architecture: { modality: "text->text", input_modalities: ["text"], output_modalities: ["text"] },
      supported_parameters: [],
    },
  ],
};

export const completeFixture = {
  id: "gen-test-complete",
  object: "chat.completion",
  created: 1_700_000_000,
  model: OPENROUTER_CHAT_MODEL,
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "Hello from OpenRouter fixture." },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
};

export const embedFixture = {
  object: "list",
  model: OPENROUTER_EMBED_MODEL,
  data: [{ object: "embedding", index: 0, embedding: [0.1, -0.2, 0.3] }],
  usage: { prompt_tokens: 4, total_tokens: 4 },
};

/** Minimal SSE stream: two deltas, usage chunk, DONE. Events separated by blank lines. */
export const streamFixtureBody = [
  `data: ${JSON.stringify({
    id: "gen-test-stream",
    object: "chat.completion.chunk",
    created: 1_700_000_000,
    model: OPENROUTER_CHAT_MODEL,
    choices: [{ index: 0, delta: { role: "assistant", content: "Hel" }, finish_reason: null }],
  })}`,
  "",
  `data: ${JSON.stringify({
    id: "gen-test-stream",
    object: "chat.completion.chunk",
    created: 1_700_000_000,
    model: OPENROUTER_CHAT_MODEL,
    choices: [{ index: 0, delta: { content: "lo" }, finish_reason: null }],
  })}`,
  "",
  `data: ${JSON.stringify({
    id: "gen-test-stream",
    object: "chat.completion.chunk",
    created: 1_700_000_000,
    model: OPENROUTER_CHAT_MODEL,
    choices: [{ index: 0, delta: { content: "" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
  })}`,
  "",
  "data: [DONE]",
  "",
  "",
].join("\n");

export function recordedOpenRouterFetch(options?: {
  onRequest?: (url: string, init?: RequestInit) => void;
  abortAfterBytes?: number;
}): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    options?.onRequest?.(url.toString(), init);
    if (url.pathname.endsWith("/models") && (!init?.method || init.method === "GET")) {
      return Response.json(modelsFixture);
    }
    if (url.pathname.endsWith("/embeddings") && init?.method === "POST") {
      return Response.json(embedFixture);
    }
    if (url.pathname.endsWith("/chat/completions") && init?.method === "POST") {
      const body = JSON.parse(String(init.body ?? "{}")) as { stream?: boolean };
      if (body.stream) {
        const bytes = new TextEncoder().encode(streamFixtureBody);
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            if (options?.abortAfterBytes !== undefined) {
              controller.enqueue(bytes.slice(0, options.abortAfterBytes));
              controller.error(new DOMException("The operation was aborted.", "AbortError"));
              return;
            }
            controller.enqueue(bytes);
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      return Response.json(completeFixture);
    }
    return new Response("not found", { status: 404 });
  };
}

export function statusFetch(status: number, body: string): typeof fetch {
  return async () => new Response(body, { status, headers: { "Content-Type": "application/json" } });
}
