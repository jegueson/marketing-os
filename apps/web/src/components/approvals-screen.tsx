"use client";

import { useState } from "react";
import { Button } from "@marketing-os/ui";
import { useApi } from "./api-view";
import type { ApiClient } from "../lib/api";
import { canDecideApprovals } from "../lib/workspace";

type ApprovalItem = {
  id: string;
  action: string;
  riskLevel: string;
  evidence: string;
  expectedImpact: string;
  status: string;
  comment: string | null;
  requesterId: string;
};

/** Portal list of pending writes. Flag off renders nothing and does not call the approvals API. */
export function ApprovalsScreen({
  api,
  workspaceId,
  role,
}: {
  api: ApiClient;
  workspaceId: string;
  role: string;
}) {
  const [features] = useApi<{ managed_work?: boolean }>(api, "/api/v1/me/features");
  const open = features.status === "ready" && features.data.managed_work === true && canDecideApprovals(role);
  const [list, reload] = useApi<ApprovalItem[]>(
    api,
    open ? `/api/v1/workspaces/${workspaceId}/approvals` : null,
  );
  const [comments, setComments] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  if (!open) return null;

  async function decide(item: ApprovalItem, decision: "approved" | "rejected"): Promise<void> {
    const comment = (comments[item.id] ?? "").trim();
    if (!comment) {
      setMessage("A comment is required.");
      return;
    }
    const res = await api<ApprovalItem>(
      `/api/v1/workspaces/${workspaceId}/approvals/${item.id}/decision`,
      { method: "POST", body: { decision, comment } },
    );
    if (!res.success) {
      setMessage(res.error?.message ?? "Decision failed");
      return;
    }
    setMessage(decision === "approved" ? "Approved." : "Rejected.");
    await reload();
  }

  return (
    <section>
      <h2>Approvals</h2>
      {message ? <p role="status">{message}</p> : null}
      {list.status === "error" ? <p>{list.message}</p> : null}
      {list.status === "ready" && list.data.length === 0 ? <p>No approvals.</p> : null}
      {list.status === "ready"
        ? list.data.map((item) => (
            <article key={item.id}>
              <dl>
                <dt>What will change</dt>
                <dd>{item.action}</dd>
                <dt>Why</dt>
                <dd>{item.evidence}</dd>
                <dt>Evidence</dt>
                <dd>{item.evidence}</dd>
                <dt>Expected effect</dt>
                <dd>{item.expectedImpact}</dd>
                <dt>Risk</dt>
                <dd>{item.riskLevel}</dd>
                <dt>Requester</dt>
                <dd>{item.requesterId}</dd>
              </dl>
              {item.status === "pending" ? (
                <>
                  <label>
                    Comment
                    <textarea
                      value={comments[item.id] ?? ""}
                      onChange={(event) =>
                        setComments((current) => ({ ...current, [item.id]: event.target.value }))
                      }
                    />
                  </label>
                  <Button onClick={() => void decide(item, "approved")}>Approve</Button>
                  <Button onClick={() => void decide(item, "rejected")}>Reject</Button>
                </>
              ) : (
                <p>{item.status}</p>
              )}
            </article>
          ))
        : null}
    </section>
  );
}
