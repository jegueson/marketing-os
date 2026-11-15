/** Recorded OpenAI API payloads. Tests never call the live API. */

export const OPENAI_CHAT_MODEL = "gpt-4o-mini";
export const OPENAI_EMBED_MODEL = "text-embedding-3-small";
export const OPENAI_TEST_KEY = "sk-test-openai-not-real";

export const openaiModelsFixture = {
  object: "list",
  data: [
    { id: OPENAI_CHAT_MODEL, object: "model", created: 1_700_000_000, owned_by: "openai" },
    { id: "gpt-4o", object: "model", created: 1_700_000_000, owned_by: "openai" },
    { id: OPENAI_EMBED_MODEL, object: "model", created: 1_700_000_000, owned_by: "openai" },
  ],
};

export const openaiCompleteFixture = {
  id: "chatcmpl-openai",
  object: "chat.completion",
  created: 1_700_000_000,
  model: OPENAI_CHAT_MODEL,
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "Hello from OpenAI fixture." },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 8, completion_tokens: 6, total_tokens: 14 },
};

export const openaiEmbedFixture = {
  object: "list",
  model: OPENAI_EMBED_MODEL,
  data: [{ object: "embedding", index: 0, embedding: [0.01, 0.02, 0.03] }],
  usage: { prompt_tokens: 3, total_tokens: 3 },
};

export const openaiStreamBody = [
  `data: ${JSON.stringify({
    id: "chatcmpl-stream",
    object: "chat.completion.chunk",
    created: 1_700_000_000,
    model: OPENAI_CHAT_MODEL,
    choices: [{ index: 0, delta: { role: "assistant", content: "Ok" }, finish_reason: null }],
  })}`,
  "",
  `data: ${JSON.stringify({
    id: "chatcmpl-stream",
    object: "chat.completion.chunk",
    created: 1_700_000_000,
    model: OPENAI_CHAT_MODEL,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
  })}`,
  "",
  "data: [DONE]",
  "",
  "",
].join("\n");

export function recordedOpenAIFetch(): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    if (!url.href.startsWith("https://api.openai.com/v1")) {
      return new Response("wrong host", { status: 404 });
    }
    if (url.pathname.endsWith("/models") && (!init?.method || init.method === "GET")) {
      return Response.json(openaiModelsFixture);
    }
    if (url.pathname.endsWith("/embeddings") && init?.method === "POST") {
      return Response.json(openaiEmbedFixture);
    }
    if (url.pathname.endsWith("/chat/completions") && init?.method === "POST") {
      const body = JSON.parse(String(init.body ?? "{}")) as { stream?: boolean };
      if (body.stream) {
        return new Response(openaiStreamBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      return Response.json(openaiCompleteFixture);
    }
    return new Response("not found", { status: 404 });
  };
}
