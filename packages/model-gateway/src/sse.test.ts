import { describe, expect, it } from "vitest";
import { readSseData } from "./sse";

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(chunks[i]!);
      i += 1;
    },
  });
}

describe("readSseData", () => {
  it("reassembles an event split across network chunks", async () => {
    const encode = (s: string) => new TextEncoder().encode(s);
    const body = streamFromChunks([
      encode('data: {"n":1}\n'),
      encode("\n"),
      encode("data: [DONE]\n\n"),
    ]);
    const payloads: string[] = [];
    for await (const payload of readSseData(body)) {
      payloads.push(payload);
    }
    expect(payloads).toEqual(['{"n":1}']);
  });

  it("flushes a trailing event without a blank line at end-of-stream", async () => {
    const body = streamFromChunks([new TextEncoder().encode('data: {"n":2}')]);
    const payloads: string[] = [];
    for await (const payload of readSseData(body)) {
      payloads.push(payload);
    }
    expect(payloads).toEqual(['{"n":2}']);
  });
});
