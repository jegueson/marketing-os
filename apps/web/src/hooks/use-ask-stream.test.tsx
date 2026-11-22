/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAskStream } from "./use-ask-stream";

describe("useAskStream", () => {
  it("aborts the in-flight fetch", async () => {
    let signal: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"type":"stage","stage":"query_plan"}\n\n'));
          init?.signal?.addEventListener("abort", () => {
            controller.error(Object.assign(new Error("The request was aborted"), { name: "AbortError" }));
          });
        },
      });
      return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
    });
    const { result } = renderHook(() =>
      useAskStream({ fetchImpl: fetchImpl as unknown as typeof fetch, getToken: async () => "tok", baseUrl: "http://api.test" }),
    );
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.ask("ws-1", "conv-1", "How much?");
    });
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "http://api.test/api/v1/workspaces/ws-1/ask/conversations/conv-1/messages/stream",
    );
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ content: "How much?" }));
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer tok");
    await act(async () => {
      result.current.abort();
      await pending;
    });
    expect(signal?.aborted).toBe(true);
    expect(result.current.state.status).toBe("aborted");
  });
});
