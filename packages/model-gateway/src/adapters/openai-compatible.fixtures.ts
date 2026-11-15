/** Recorded OpenAI-compatible payloads (Ollama / vLLM / LM Studio shape). */

export const COMPAT_CHAT_MODEL = "llama3.2";
export const COMPAT_EMBED_MODEL = "nomic-embed-text";
export const COMPAT_TEST_KEY = "ollama-local-key";
export const COMPAT_BASE_URL = "http://localhost:11434/v1";

export const compatModelsFixture = {
  object: "list",
  data: [
    { id: COMPAT_CHAT_MODEL, object: "model", created: 1_700_000_000, owned_by: "library" },
    { id: COMPAT_EMBED_MODEL, object: "model", created: 1_700_000_000, owned_by: "library" },
  ],
};

export const compatCompleteFixture = {
  id: "chatcmpl-compat",
  object: "chat.completion",
  created: 1_700_000_000,
  model: COMPAT_CHAT_MODEL,
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "Hello from local fixture." },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 6, completion_tokens: 5, total_tokens: 11 },
};

export const compatEmbedFixture = {
  object: "list",
  model: COMPAT_EMBED_MODEL,
  data: [{ object: "embedding", index: 0, embedding: [0.4, 0.5] }],
  usage: { prompt_tokens: 2, total_tokens: 2 },
};

export const compatStreamBody = [
  `data: ${JSON.stringify({
    id: "chatcmpl-stream",
    object: "chat.completion.chunk",
    created: 1_700_000_000,
    model: COMPAT_CHAT_MODEL,
    choices: [{ index: 0, delta: { role: "assistant", content: "Hi" }, finish_reason: null }],
  })}`,
  "",
  `data: ${JSON.stringify({
    id: "chatcmpl-stream",
    object: "chat.completion.chunk",
    created: 1_700_000_000,
    model: COMPAT_CHAT_MODEL,
    choices: [{ index: 0, delta: { content: "!" }, finish_reason: null }],
  })}`,
  "",
  `data: ${JSON.stringify({
    id: "chatcmpl-stream",
    object: "chat.completion.chunk",
    created: 1_700_000_000,
    model: COMPAT_CHAT_MODEL,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
  })}`,
  "",
  "data: [DONE]",
  "",
  "",
].join("\n");

export function recordedCompatFetch(options?: {
  redirectTo?: string;
  onRequest?: (url: string, init?: RequestInit) => void;
}): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    options?.onRequest?.(url.toString(), init);

    if (options?.redirectTo && !url.searchParams.has("followed")) {
      return new Response(null, {
        status: 302,
        headers: { Location: options.redirectTo },
      });
    }

    if (url.pathname.endsWith("/models") && (!init?.method || init.method === "GET")) {
      return Response.json(compatModelsFixture);
    }
    if (url.pathname.endsWith("/embeddings") && init?.method === "POST") {
      return Response.json(compatEmbedFixture);
    }
    if (url.pathname.endsWith("/chat/completions") && init?.method === "POST") {
      const body = JSON.parse(String(init.body ?? "{}")) as { stream?: boolean };
      if (body.stream) {
        return new Response(compatStreamBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      return Response.json(compatCompleteFixture);
    }
    return new Response("not found", { status: 404 });
  };
}
