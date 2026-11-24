"use client";

import { useState } from "react";
import { ErrorState } from "@marketing-os/ui";
import { useApi } from "@/components/api-view";
import type { ApiClient } from "@/lib/api";
import styles from "./customer-config.module.css";

type WorkspaceRef = { id: string; name: string };
type Tab = "skills" | "agents" | "workflows";

type ConfigItem = {
  id: string;
  status: "draft" | "published";
  activeVersion: number | null;
  draft: unknown;
};

type WorkflowRunView = {
  id: string;
  workflowId: string;
  status: string;
  errorCode: string | null;
  report: { title: string; body: string } | null;
};

const TABS: { id: Tab; label: string }[] = [
  { id: "skills", label: "Skills" },
  { id: "agents", label: "Agents" },
  { id: "workflows", label: "Workflows" },
];

function draftName(draft: unknown, fallback: string): string {
  if (draft && typeof draft === "object" && "name" in draft && typeof draft.name === "string") {
    return draft.name;
  }
  return fallback;
}

function draftMeta(draft: unknown): string {
  if (!draft || typeof draft !== "object") return "";
  const record = draft as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof record.domain === "string") parts.push(record.domain);
  if (typeof record.version === "string") parts.push(record.version);
  if (typeof record.autonomy === "string") parts.push(record.autonomy);
  if (record.trigger && typeof record.trigger === "object" && "type" in record.trigger) {
    parts.push(String((record.trigger as { type: unknown }).type));
  }
  return parts.join(" · ");
}

export function CustomerConfig({ api, workspaces }: { api: ApiClient; workspaces: WorkspaceRef[] }) {
  const [features] = useApi<{ specialist_config?: boolean }>(api, "/api/v1/me/features");
  if (features.status !== "ready" || features.data.specialist_config !== true) return null;

  return (
    <section className={styles.panel} aria-labelledby="customer-config-title">
      <div className={styles.header}>
        <div>
          <h2 id="customer-config-title" className={styles.title}>
            Specialist configuration
          </h2>
          <p className={styles.subtitle}>
            Skills, agents and workflows for this customer. Run a published workflow to read the latest
            report.
          </p>
        </div>
      </div>
      {workspaces.length === 0 ? (
        <p className={styles.empty}>No workspace yet.</p>
      ) : (
        workspaces.map((workspace) => (
          <WorkspaceConfig key={workspace.id} api={api} workspace={workspace} showName={workspaces.length > 1} />
        ))
      )}
    </section>
  );
}

function WorkspaceConfig({
  api,
  workspace,
  showName,
}: {
  api: ApiClient;
  workspace: WorkspaceRef;
  showName: boolean;
}) {
  const [tab, setTab] = useState<Tab>("skills");
  const base = `/api/v1/workspaces/${workspace.id}`;
  const [skills] = useApi<ConfigItem[]>(api, `${base}/skills`);
  const [agents] = useApi<ConfigItem[]>(api, `${base}/agents`);
  const [workflows] = useApi<ConfigItem[]>(api, `${base}/workflows`);
  const [runNotice, setRunNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [latestRun, setLatestRun] = useState<WorkflowRunView | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  async function runWorkflow(workflowId: string) {
    setRunningId(workflowId);
    setRunNotice(null);
    try {
      const res = await api<WorkflowRunView>(`${base}/workflows/${workflowId}/test-runs`, {
        method: "POST",
      });
      if (!res.success || !res.data) {
        setRunNotice({ ok: false, text: res.error?.message ?? "Test run failed" });
        return;
      }
      setLatestRun(res.data);
      setRunNotice({
        ok: true,
        text: res.data.status === "succeeded" ? "Test run finished." : `Test run ${res.data.status}.`,
      });
    } catch (error) {
      setRunNotice({
        ok: false,
        text: error instanceof Error ? error.message : "Test run failed",
      });
    } finally {
      setRunningId(null);
    }
  }

  const list =
    tab === "skills" ? skills : tab === "agents" ? agents : workflows;

  return (
    <div>
      {showName ? <h3 className={styles.cardName}>{workspace.name}</h3> : null}
      <div className={styles.tabs} role="tablist" aria-label="Configuration sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {list.status === "loading" ? <p role="status">Loading…</p> : null}
      {list.status === "error" ? <ErrorState title="Could not load" body={list.message} /> : null}
      {list.status === "ready" ? (
        list.data.length === 0 ? (
          <p className={styles.empty}>No {tab} yet.</p>
        ) : (
          <ul className={styles.grid}>
            {list.data.map((item) => {
              const name = draftName(item.draft, item.id.slice(0, 8));
              return (
                <li key={item.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <span className={styles.icon} aria-hidden="true">
                      {tab === "skills" ? "S" : tab === "agents" ? "A" : "W"}
                    </span>
                    <span
                      className={`${styles.badge} ${
                        item.status === "published" ? styles.badgePublished : styles.badgeDraft
                      }`}
                    >
                      {item.status}
                      {item.activeVersion != null ? ` v${item.activeVersion}` : ""}
                    </span>
                  </div>
                  <h3 className={styles.cardName}>{name}</h3>
                  <p className={styles.meta}>{draftMeta(item.draft) || "—"}</p>
                  {tab === "workflows" && item.status === "published" ? (
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.runButton}
                        disabled={runningId === item.id}
                        onClick={() => void runWorkflow(item.id)}
                      >
                        {runningId === item.id ? "Running…" : "Run test"}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )
      ) : null}

      {runNotice ? (
        runNotice.ok ? (
          <p role="status">{runNotice.text}</p>
        ) : (
          <ErrorState title="Test run failed" body={runNotice.text} />
        )
      ) : null}

      {latestRun?.report ? (
        <article className={styles.report} aria-label="Latest test-run report">
          <h3 className={styles.reportTitle}>{latestRun.report.title}</h3>
          <p className={styles.reportMeta}>
            Run {latestRun.id.slice(0, 8)} · {latestRun.status}
            {latestRun.errorCode ? ` · ${latestRun.errorCode}` : ""}
          </p>
          <pre className={styles.reportBody}>{latestRun.report.body}</pre>
        </article>
      ) : null}
    </div>
  );
}
