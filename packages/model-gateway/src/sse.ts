import { ModelGatewayError } from "./errors";

export type ReadSseOptions = {
  signal?: AbortSignal | undefined;
  /** Called when the stream ends normally with `[DONE]`. */
  onDone?: () => void;
};

/** Parse an SSE byte stream into data payload strings (skips comments and empty lines). */
export async function* readSseData(
  body: ReadableStream<Uint8Array>,
  options: ReadSseOptions = {},
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines: string[] = [];
  let sawDone = false;

  const onAbort = () => {
    void reader.cancel("aborted").catch(() => undefined);
  };
  if (options.signal) {
    if (options.signal.aborted) {
      await reader.cancel("aborted").catch(() => undefined);
      throw new ModelGatewayError("Request aborted or timed out", "provider_unavailable", true);
    }
    options.signal.addEventListener("abort", onAbort, { once: true });
  }

  const flushEvent = function* (): Generator<string> {
    if (dataLines.length === 0) return;
    const payload = dataLines.join("\n");
    dataLines = [];
    if (payload === "[DONE]") {
      sawDone = true;
      options.onDone?.();
      return;
    }
    yield payload;
  };

  try {
    while (true) {
      if (options.signal?.aborted) {
        throw new ModelGatewayError("Request aborted or timed out", "provider_unavailable", true);
      }
      let readResult: ReadableStreamReadResult<Uint8Array>;
      try {
        readResult = await reader.read();
      } catch (err) {
        if (err instanceof ModelGatewayError) throw err;
        if (err instanceof Error && err.name === "AbortError") {
          throw new ModelGatewayError("Request aborted or timed out", "provider_unavailable", true);
        }
        throw new ModelGatewayError(
          err instanceof Error ? err.message.slice(0, 200) : "Stream read failed",
          "provider_unavailable",
          true,
        );
      }
      const { done, value } = readResult;
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const raw of parts) {
        const line = raw.replace(/\r$/, "");
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
          continue;
        }
        if (line === "") {
          yield* flushEvent();
          if (sawDone) return;
        }
      }
    }
    buffer += decoder.decode();
    if (buffer.length > 0) {
      const line = buffer.replace(/\r$/, "");
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    yield* flushEvent();
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    try {
      reader.releaseLock();
    } catch {
      // already cancelled
    }
  }
}
