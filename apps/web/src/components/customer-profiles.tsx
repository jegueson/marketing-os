"use client";

import { useState } from "react";
import { Button, ErrorState, Input } from "@marketing-os/ui";
import { useApi } from "@/components/api-view";
import type { ApiClient } from "@/lib/api";

type WorkspaceRef = { id: string; name: string };
type Kind = "business" | "brand";
type FieldKind = "text" | "list" | "cadence";
type Cadence = "daily" | "weekly" | "monthly";
type Field = { key: string; label: string; kind: FieldKind; optional?: boolean };
type ProfileView = {
  kind: Kind;
  status: "draft" | "published";
  activeVersion: number | null;
  draft: unknown;
};
type Notice = { kind: "success"; text: string; version?: number } | { kind: "error"; title: string; text: string };

const UNLOADED = Symbol("profile-draft-unloaded");

const BUSINESS_FIELDS: readonly Field[] = [
  { key: "companyDescription", label: "Company description", kind: "text" },
  { key: "businessModel", label: "Business model", kind: "text" },
  { key: "products", label: "Products", kind: "list" },
  { key: "markets", label: "Markets", kind: "list" },
  { key: "businessGoals", label: "Business goals", kind: "list" },
  { key: "marketingGoals", label: "Marketing goals", kind: "list" },
  { key: "primaryKpis", label: "Primary KPIs", kind: "list" },
  { key: "reportingCadence", label: "Reporting cadence", kind: "cadence" },
];

const BRAND_FIELDS: readonly Field[] = [
  { key: "positioning", label: "Positioning", kind: "text" },
  { key: "audience", label: "Audience", kind: "text" },
  { key: "tone", label: "Tone", kind: "list" },
  { key: "preferredTerms", label: "Preferred terms", kind: "list" },
  { key: "bannedTerms", label: "Banned terms", kind: "list" },
  { key: "visualGuidance", label: "Visual guidance", kind: "text", optional: true },
  { key: "approvedClaims", label: "Approved claims", kind: "list" },
  { key: "prohibitedClaims", label: "Prohibited claims", kind: "list" },
  { key: "marketLanguage", label: "Market language", kind: "list" },
  { key: "exampleAssetIds", label: "Example asset ids", kind: "list" },
];

function fieldsFor(kind: Kind): readonly Field[] {
  return kind === "business" ? BUSINESS_FIELDS : BRAND_FIELDS;
}

function isCadence(value: unknown): value is Cadence {
  return value === "daily" || value === "weekly" || value === "monthly";
}

function listText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.map((item) => String(item)).join("\n");
}

function listValue(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function toForm(draft: unknown, fields: readonly Field[]): Record<string, string> {
  const record = draft !== null && typeof draft === "object" ? (draft as Record<string, unknown>) : {};
  const form: Record<string, string> = {};
  for (const field of fields) {
    const value = record[field.key];
    if (field.kind === "list") form[field.key] = listText(value);
    else if (field.kind === "cadence") form[field.key] = isCadence(value) ? value : "weekly";
    else form[field.key] = typeof value === "string" ? value : "";
  }
  return form;
}

/** Lists stay arrays, including an empty example-asset list. A blank optional string is omitted. */
function toDraft(form: Record<string, string>, fields: readonly Field[]): Record<string, unknown> {
  const draft: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = form[field.key] ?? "";
    if (field.kind === "list") {
      draft[field.key] = listValue(raw);
      continue;
    }
    if (field.kind === "cadence") {
      draft[field.key] = isCadence(raw) ? raw : "weekly";
      continue;
    }
    if (field.optional && raw.trim() === "") continue;
    draft[field.key] = raw;
  }
  return draft;
}

function groupLabel(kind: Kind, workspaceName: string, workspaceCount: number): string {
  const title = kind === "business" ? "Business profile" : "Brand profile";
  return workspaceCount > 1 ? `${title} for ${workspaceName}` : title;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}

async function requestProfileAction(
  api: ApiClient,
  path: string,
  action: "save" | "publish",
  body: Record<string, unknown>,
): Promise<Notice> {
  const fallback = action === "save" ? "Could not save the draft" : "Could not publish the profile";
  const title = action === "save" ? "Save failed" : "Publish failed";
  try {
    const saved = await api<ProfileView>(path, { method: "PUT", body });
    if (!saved.success) return { kind: "error", title, text: saved.error?.message ?? fallback };
    if (action === "save") return { kind: "success", text: "Draft saved." };
    const published = await api<{ version?: unknown }>(`${path}/publish`, { method: "POST" });
    if (!published.success || published.data == null || typeof published.data.version !== "number") {
      return { kind: "error", title, text: published.error?.message ?? fallback };
    }
    return { kind: "success", text: `Published version ${published.data.version}.`, version: published.data.version };
  } catch (error) {
    return { kind: "error", title, text: errorMessage(error, fallback) };
  }
}

export function CustomerProfiles({ api, workspaces }: { api: ApiClient; workspaces: WorkspaceRef[] }) {
  const [features] = useApi<{ specialist_config?: boolean }>(api, "/api/v1/me/features");
  // Hidden until the flag is on, including while the flag request is still loading.
  if (features.status !== "ready" || features.data.specialist_config !== true) return null;
  return (
    <section>
      <h2>Profiles</h2>
      {workspaces.length === 0 ? (
        <p>No workspace yet.</p>
      ) : (
        workspaces.map((workspace) => (
          <WorkspaceProfiles
            key={workspace.id}
            api={api}
            workspace={workspace}
            workspaceCount={workspaces.length}
          />
        ))
      )}
    </section>
  );
}

function WorkspaceProfiles({
  api,
  workspace,
  workspaceCount,
}: {
  api: ApiClient;
  workspace: WorkspaceRef;
  workspaceCount: number;
}) {
  const base = `/api/v1/workspaces/${workspace.id}/profiles`;
  return (
    <div>
      {workspaceCount > 1 ? <h3>{workspace.name}</h3> : null}
      <LoadedProfile
        api={api}
        kind="business"
        path={`${base}/business`}
        workspace={workspace}
        workspaceCount={workspaceCount}
      />
      <LoadedProfile
        api={api}
        kind="brand"
        path={`${base}/brand`}
        workspace={workspace}
        workspaceCount={workspaceCount}
      />
    </div>
  );
}

function LoadedProfile({
  api,
  kind,
  path,
  workspace,
  workspaceCount,
}: {
  api: ApiClient;
  kind: Kind;
  path: string;
  workspace: WorkspaceRef;
  workspaceCount: number;
}) {
  const [state] = useApi<ProfileView>(api, path);
  if (state.status === "loading") return <p role="status">Loading profile…</p>;
  if (state.status === "error") return <ErrorState title="Could not load profile" body={state.message} />;
  return (
    <ProfileEditor
      api={api}
      kind={kind}
      path={path}
      view={state.data}
      workspace={workspace}
      workspaceCount={workspaceCount}
    />
  );
}

function ProfileFields({
  fields,
  form,
  onChange,
}: {
  fields: readonly Field[];
  form: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <>
      {fields.map((field) =>
        field.kind === "cadence" ? (
          <label key={field.key}>
            <span>{field.label}</span>
            <select value={form[field.key] ?? "weekly"} onChange={(event) => onChange(field.key, event.target.value)}>
              <option value="daily">daily</option>
              <option value="weekly">weekly</option>
              <option value="monthly">monthly</option>
            </select>
          </label>
        ) : (
          field.kind === "list" ? (
            <label key={field.key}>
              <span>{field.label}</span>
              <textarea
                name={field.key}
                value={form[field.key] ?? ""}
                rows={3}
                placeholder="One item per line"
                onChange={(event) => onChange(field.key, event.target.value)}
              />
            </label>
          ) : (
            <Input
              key={field.key}
              label={field.label}
              name={field.key}
              value={form[field.key] ?? ""}
              onChange={(event) => onChange(field.key, event.target.value)}
            />
          )
        ),
      )}
    </>
  );
}

function ProfileEditor({
  api,
  kind,
  path,
  view,
  workspace,
  workspaceCount,
}: {
  api: ApiClient;
  kind: Kind;
  path: string;
  view: ProfileView;
  workspace: WorkspaceRef;
  workspaceCount: number;
}) {
  const fields = fieldsFor(kind);
  const [source, setSource] = useState<unknown>(UNLOADED);
  const [form, setForm] = useState<Record<string, string>>({});
  const [status, setStatus] = useState(view.status);
  const [activeVersion, setActiveVersion] = useState(view.activeVersion);
  const [pending, setPending] = useState<"save" | "publish" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  if (view.draft !== source) {
    setSource(view.draft);
    setForm(toForm(view.draft, fields));
    setStatus(view.status);
    setActiveVersion(view.activeVersion);
    setNotice(null);
  }

  async function submit(action: "save" | "publish") {
    setPending(action);
    setNotice(null);
    const result = await requestProfileAction(api, path, action, toDraft(form, fields));
    if (result.kind === "success" && result.version != null) {
      setStatus("published");
      setActiveVersion(result.version);
    }
    setNotice(result);
    setPending(null);
  }

  const title = kind === "business" ? "Business profile" : "Brand profile";
  const saveLabel = kind === "business" ? "Save business draft" : "Save brand draft";
  const publishLabel = kind === "business" ? "Publish business profile" : "Publish brand profile";
  const version =
    status === "published" && activeVersion != null ? `Active version ${activeVersion}.` : "Not published.";

  return (
    <fieldset aria-label={groupLabel(kind, workspace.name, workspaceCount)}>
      <legend>{title}</legend>
      <p>{version}</p>
      <ProfileFields
        fields={fields}
        form={form}
        onChange={(key, value) => setForm((current) => ({ ...current, [key]: value }))}
      />
      <Button disabled={pending !== null} onClick={() => void submit("save")}>
        {saveLabel}
      </Button>{" "}
      <Button disabled={pending !== null} onClick={() => void submit("publish")}>
        {publishLabel}
      </Button>
      {notice?.kind === "error" ? <ErrorState title={notice.title} body={notice.text} /> : null}
      {notice?.kind === "success" ? <p role="status">{notice.text}</p> : null}
    </fieldset>
  );
}
