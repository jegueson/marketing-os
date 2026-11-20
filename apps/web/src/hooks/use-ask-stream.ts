"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiBaseUrl } from "../lib/api";
import {
  consumeAskStream,
  initialAskRun,
  reduceAskEvent,
  AskStreamParseError,
  type AskRunState,
} from "../lib/ask-stream";

type UseAskStreamOptions = {
  getToken?: () => Promise<string | null | undefined>;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
};

/** POST the question stream and fold each validated event into state. `abort` cancels the fetch. */
export function useAskStream(options: UseAskStreamOptions = {}) {
  const [state, setState] = useState<AskRunState>(initialAskRun());
  const abortRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const getToken = options.getToken;
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? apiBaseUrl();

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const ask = useCallback(
    async (workspaceId: string, conversationId: string, content: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (mounted.current) setState({ ...initialAskRun(), status: "streaming" });
      const headers: Record<string, string> = {
        accept: "text/event-stream",
        "content-type": "application/json",
      };
      const token = await getToken?.();
      if (token) headers.authorization = `Bearer ${token}`;
      let response: Response;
      try {
        response = await fetchImpl(
          `${baseUrl}/api/v1/workspaces/${workspaceId}/ask/conversations/${conversationId}/messages/stream`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ content }),
            signal: controller.signal,
          },
        );
      } catch (err) {
        if (!mounted.current) return;
        if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
          setState((current) => ({ ...current, status: "aborted" }));
          return;
        }
        setState((current) => ({
          ...current,
          status: "error",
          error: { code: "network_error", message: "Could not reach the server." },
        }));
        return;
      }
      if (controller.signal.aborted) {
        if (mounted.current) setState((current) => ({ ...current, status: "aborted" }));
        return;
      }
      const type = response.headers.get("content-type") ?? "";
      if (!type.includes("text/event-stream") || !response.body) {
        if (mounted.current) {
          setState((current) => ({
            ...current,
            status: "error",
            error: { code: "bad_response", message: `Ask stream was not started (${response.status}).` },
          }));
        }
        return;
      }
      try {
        const outcome = await consumeAskStream(
          response.body,
          (event) => {
            if (mounted.current) setState((current) => reduceAskEvent(current, event));
          },
          controller.signal,
        );
        if (mounted.current && outcome === "aborted") {
          setState((current) => ({ ...current, status: "aborted" }));
        }
      } catch (err) {
        if (!mounted.current) return;
        const message = err instanceof AskStreamParseError ? err.message : "The ask stream failed.";
        setState((current) => ({
          ...current,
          status: "error",
          error: { code: err instanceof AskStreamParseError ? err.code : "internal_error", message },
        }));
      }
    },
    [baseUrl, fetchImpl, getToken],
  );

  return { state, ask, abort };
}
