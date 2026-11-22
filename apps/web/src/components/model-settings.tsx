"use client";

import { useEffect, useState } from "react";
import { Button, EmptyState, Input } from "@marketing-os/ui";
import type { ApiClient } from "../lib/api";
import { canManageModels } from "../lib/workspace";

const PROVIDERS = ["openrouter", "openai_compatible", "openai", "anthropic"] as const;
type Provider = (typeof PROVIDERS)[number];

type Settings = {
  configured: boolean;
  provider: Provider | null;
  baseUrl: string | null;
  defaultModel: string | null;
  fingerprint: string | null;
};

type Usage = {
  totalCostMicroUsd: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  budget: { monthlyCapMicroUsd: number | null; enforcement: "hard" | "warn" } | null;
};

type Notice = { kind: "success" | "invalid_key" | "endpoint_blocked" | "error"; text: string };

function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value);
}

/** Map a model API failure to the three states the settings page shows. */
export function modelNotice(code: string, message: string): Notice {
  if (code === "invalid_key") return { kind: "invalid_key", text: message };
  if (code === "endpoint_blocked" || /blocked/i.test(message)) return { kind: "endpoint_blocked", text: message };
  return { kind: "error", text: message };
}

export function ModelSettings({
  api,
  workspaceId,
  role,
}: {
  api: ApiClient;
  workspaceId: string;
  role: string;
}) {
  const allowed = canManageModels(role);
  const base = `/api/v1/workspaces/${workspaceId}/models`;
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>("openrouter");
  const [baseUrl, setBaseUrl] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [cap, setCap] = useState("");
  const [enforcement, setEnforcement] = useState<"hard" | "warn">("warn");
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    void (async () => {
      const [settingsRes, usageRes] = await Promise.all([
        api<Settings>(`${base}/settings`),
        api<Usage>(`${base}/usage`),
      ]);
      if (cancelled) return;
      if (!settingsRes.success || !settingsRes.data) {
        setLoadError(settingsRes.error?.message ?? "Could not load model settings");
        setLoaded(true);
        return;
      }
      const settings = settingsRes.data;
      setProvider(settings.provider && isProvider(settings.provider) ? settings.provider : "openrouter");
      setBaseUrl(settings.baseUrl ?? "");
      setDefaultModel(settings.defaultModel ?? "");
      setFingerprint(settings.fingerprint);
      setApiKey("");
      if (usageRes.success && usageRes.data) {
        setUsage(usageRes.data);
        setCap(usageRes.data.budget?.monthlyCapMicroUsd == null ? "" : String(usageRes.data.budget.monthlyCapMicroUsd));
        setEnforcement(usageRes.data.budget?.enforcement ?? "warn");
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, api, base]);

  if (!allowed) {
    return (
      <EmptyState
        title="Model settings are hidden"
        body="Model settings are limited to workspace admins."
      />
    );
  }
  if (!loaded) return <p role="status">Loading…</p>;
  if (loadError) return <EmptyState title="Could not load model settings" body={loadError} />;

  async function saveSettings() {
    setNotice(null);
    if (apiKey.trim().length < 8) {
      setNotice({ kind: "error", text: "Enter an API key. Stored keys are never shown again." });
      return;
    }
    if (provider === "openai_compatible" && !baseUrl.trim()) {
      setNotice({ kind: "error", text: "openai_compatible requires a base URL." });
      return;
    }
    const res = await api<Settings>(`${base}/settings`, {
      method: "PUT",
      body: {
        provider,
        apiKey,
        baseUrl: baseUrl.trim() ? baseUrl.trim() : null,
        defaultModel: defaultModel.trim() ? defaultModel.trim() : null,
      },
    });
    if (!res.success || !res.data) {
      setNotice(modelNotice(res.error?.code ?? "error", res.error?.message ?? "Could not save model settings"));
      return;
    }
    setProvider(res.data.provider && isProvider(res.data.provider) ? res.data.provider : provider);
    setBaseUrl(res.data.baseUrl ?? "");
    setDefaultModel(res.data.defaultModel ?? "");
    setFingerprint(res.data.fingerprint);
    setApiKey("");
    setNotice({ kind: "success", text: "Model settings saved." });
  }

  async function testConnection() {
    setNotice(null);
    const res = await api<{ modelCount: number }>(`${base}/test`, { method: "POST" });
    if (!res.success || !res.data) {
      setNotice(modelNotice(res.error?.code ?? "error", res.error?.message ?? "Connection test failed"));
      return;
    }
    setNotice({ kind: "success", text: `Provider reachable. ${res.data.modelCount} models.` });
  }

  async function saveBudget() {
    setNotice(null);
    const monthlyCapMicroUsd = cap.trim() === "" ? null : Number(cap);
    if (monthlyCapMicroUsd != null && !Number.isInteger(monthlyCapMicroUsd)) {
      setNotice({ kind: "error", text: "Monthly cap must be a whole number of micro-USD." });
      return;
    }
    const res = await api<{ monthlyCapMicroUsd: number | null; enforcement: "hard" | "warn" }>(`${base}/budget`, {
      method: "PUT",
      body: { monthlyCapMicroUsd, enforcement },
    });
    if (!res.success || !res.data) {
      setNotice(modelNotice(res.error?.code ?? "error", res.error?.message ?? "Could not save the budget"));
      return;
    }
    setNotice({ kind: "success", text: "Budget saved." });
  }

  return (
    <section>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void saveSettings();
        }}
      >
        <label>
          <span>Provider</span>
          <select value={provider} onChange={(event) => {
            if (isProvider(event.target.value)) setProvider(event.target.value);
          }}>
            {PROVIDERS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <Input label="Base URL" name="baseUrl" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
        <Input
          label="API key"
          name="apiKey"
          type="password"
          autoComplete="new-password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
        <Input
          label="Default model"
          name="defaultModel"
          value={defaultModel}
          onChange={(event) => setDefaultModel(event.target.value)}
        />
        <p>Key fingerprint: <span>{fingerprint ?? "none"}</span></p>
        <Button type="submit">Save model settings</Button>
        <Button type="button" onClick={() => void testConnection()}>
          Test connection
        </Button>
      </form>
      {notice ? (
        <p role="status" data-state={notice.kind}>
          {notice.text}
        </p>
      ) : null}
      <h2>Usage this month</h2>
      {usage ? (
        <p>
          Calls <span>{usage.calls}</span>. Input tokens <span>{usage.inputTokens}</span>. Output tokens{" "}
          <span>{usage.outputTokens}</span>. Cost <span>{usage.totalCostMicroUsd}</span> micro-USD.
        </p>
      ) : (
        <p>Usage is not available.</p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void saveBudget();
        }}
      >
        <Input label="Monthly cap (micro-USD)" name="cap" inputMode="numeric" value={cap} onChange={(event) => setCap(event.target.value)} />
        <label>
          <span>Enforcement</span>
          <select
            value={enforcement}
            onChange={(event) => setEnforcement(event.target.value === "hard" ? "hard" : "warn")}
          >
            <option value="warn">warn</option>
            <option value="hard">hard</option>
          </select>
        </label>
        <Button type="submit">Save budget</Button>
      </form>
    </section>
  );
}
