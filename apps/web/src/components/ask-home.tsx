"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Input } from "@marketing-os/ui";
import { useAskStream } from "../hooks/use-ask-stream";
import { AskAnswerPanel } from "./ask-answer-panel";
import { starterChips, starterQuestion } from "../lib/ask";
import type { ApiClient } from "../lib/api";
import { canUseAsk } from "../lib/workspace";

type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type AskMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type ConversationDetail = Conversation & { messages: AskMessage[] };

type MetricCard = { key: string; label: string; value: number | null };

type CockpitCards = {
  widgets: {
    executive: MetricCard[];
    performance: MetricCard[];
    funnel: MetricCard[];
    leads: MetricCard[];
  };
};

export function AskHome({
  api,
  workspaceId,
  role,
  getToken,
}: {
  api: ApiClient;
  workspaceId: string;
  role: string;
  getToken?: () => Promise<string | null | undefined>;
}) {
  const allowed = canUseAsk(role);
  const stream = useAskStream(getToken ? { getToken } : {});
  const base = `/api/v1/workspaces/${workspaceId}`;
  const [flag, setFlag] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<ConversationDetail | null>(null);
  const [chips, setChips] = useState<{ key: string; label: string }[]>([]);
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const listed = await api<Conversation[]>(`${base}/ask/conversations`);
    if (listed.success && listed.data) setConversations(listed.data);
    else setError(listed.error?.message ?? "Could not load conversations");
  }, [api, base]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    void (async () => {
      const features = await api<Record<string, boolean>>(`${base}/features`);
      if (cancelled) return;
      const enabled = features.success && features.data?.ask_marketing === true;
      setFlag(enabled);
      if (!enabled) return;
      const [settings, cockpit] = await Promise.all([
        api<{ configured: boolean }>(`${base}/models/settings`),
        api<CockpitCards>(`${base}/cockpit`),
      ]);
      if (cancelled) return;
      setConfigured(settings.success && settings.data ? settings.data.configured : null);
      const cards = cockpit.success && cockpit.data
        ? [
            ...cockpit.data.widgets.executive,
            ...cockpit.data.widgets.performance,
            ...cockpit.data.widgets.funnel,
            ...cockpit.data.widgets.leads,
          ]
        : [];
      setChips(starterChips(cards));
      await reload();
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, api, base, reload]);

  if (!allowed) {
    return <EmptyState title="Ask is hidden" body="Ask is not available for your role." />;
  }
  if (flag == null) return <p role="status">Loading…</p>;
  if (!flag) return <EmptyState title="Ask is off" body="Ask is not enabled." />;

  async function openConversation(id: string) {
    setError(null);
    const res = await api<ConversationDetail>(`${base}/ask/conversations/${id}`);
    if (!res.success || !res.data) {
      setError(res.error?.message ?? "Could not load the conversation");
      return;
    }
    setSelected(res.data);
  }

  async function createConversation(nextTitle: string) {
    setError(null);
    const res = await api<Conversation>(`${base}/ask/conversations`, {
      method: "POST",
      body: { title: nextTitle },
    });
    if (!res.success || !res.data) {
      setError(res.error?.message ?? "Could not start a conversation");
      return;
    }
    setTitle("");
    await reload();
    await openConversation(res.data.id);
  }

  async function deleteConversation(id: string) {
    setError(null);
    const res = await api<{ deleted: true }>(`${base}/ask/conversations/${id}`, { method: "DELETE" });
    if (!res.success) {
      setError(res.error?.message ?? "Could not delete the conversation");
      return;
    }
    if (selected?.id === id) setSelected(null);
    await reload();
  }

  const noModel = configured === false;

  return (
    <section>
      {error ? <p role="alert">{error}</p> : null}
      {noModel ? (
        <EmptyState
          title="No model configured"
          body="No model configured. Add one in model settings before asking."
        />
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim()) void createConversation(title.trim());
          }}
        >
          <div>
            {chips.map((chip) => (
              <Button key={chip.key} type="button" onClick={() => setTitle(starterQuestion(chip.label))}>
                {chip.label}
              </Button>
            ))}
          </div>
          <Input label="Title" name="title" value={title} onChange={(event) => setTitle(event.target.value)} />
          <Button type="submit">New conversation</Button>
        </form>
      )}
      <h2>History</h2>
      {conversations.length === 0 ? <p>No conversations yet.</p> : null}
      <ul>
        {conversations.map((conversation) => (
          <li key={conversation.id}>
            <Button type="button" onClick={() => void openConversation(conversation.id)}>
              {conversation.title}
            </Button>
            <Button type="button" onClick={() => void deleteConversation(conversation.id)}>
              Delete {conversation.title}
            </Button>
          </li>
        ))}
      </ul>
      {selected ? (
        <article>
          <h3>{selected.title}</h3>
          {selected.messages.length === 0 ? <p>No messages yet.</p> : null}
          {selected.messages.map((message) => (
            <p key={message.id}>
              {message.role}: {message.content}
            </p>
          ))}
          {noModel ? null : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const content = question.trim();
                if (content) void stream.ask(workspaceId, selected.id, content);
              }}
            >
              <Input label="Question" name="question" value={question} onChange={(event) => setQuestion(event.target.value)} />
              <Button type="submit">Ask</Button>
              <Button type="button" onClick={stream.abort}>
                Stop
              </Button>
              <p data-state={stream.state.status}>Stream {stream.state.status}</p>
            </form>
          )}
          {stream.state.status === "idle" ? null : <AskAnswerPanel state={stream.state} />}
        </article>
      ) : null}
    </section>
  );
}
