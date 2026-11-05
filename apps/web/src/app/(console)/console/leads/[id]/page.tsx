"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, ErrorState, Form, Input } from "@marketing-os/ui";
import { RequireAuth, type ReadyAuth } from "@/components/auth";
import { useApi, View } from "@/components/api-view";
import { nextLeadStatuses } from "@/lib/workspace";

type LeadDetail = {
  lead: {
    id: string;
    companyName: string;
    contactName: string;
    email: string;
    jobTitle: string | null;
    intent: string;
    status: string;
    majorProblem: string | null;
    convertedTenantId: string | null;
  };
  briefs: { id: string; freeText: string | null }[];
  sources: {
    id: string;
    sourceType: string;
    utmSource: string | null;
    utmCampaign: string | null;
  }[];
  notes: { id: string; body: string; createdAt: string }[];
  opportunity: {
    title: string;
    businessProblems: string | null;
    pilotObjectives: string | null;
  } | null;
  statusHistory: { at: string; payload: { from: string; to: string } }[];
};

type ConvertResult = {
  tenant: { id: string };
  invitation: { email: string; emailDelivery: "sent" | "failed" };
};

function LeadView({ auth, id }: { auth: ReadyAuth; id: string }) {
  const [state, reload] = useApi<LeadDetail>(auth.api, `/api/v1/leads/${id}`);
  const [error, setError] = useState<string | null>(null);
  const [converted, setConverted] = useState<ConvertResult | null>(null);

  async function act(path: string, method: "POST" | "PATCH" | "PUT", body?: unknown) {
    setError(null);
    const res = await auth.api<unknown>(path, { method, body });
    if (!res.success) setError(res.error?.message ?? "Action failed");
    await reload();
    return res;
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "").trim();
    if (!body) return;
    const res = await act(`/api/v1/leads/${id}/notes`, "POST", { body });
    if (res.success) form.reset();
  }

  async function saveDiscovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim() || undefined;
    await act(`/api/v1/leads/${id}/opportunity`, "PUT", {
      title: value("title") ?? "Pilot",
      businessProblems: value("businessProblems"),
      pilotObjectives: value("pilotObjectives"),
    });
  }

  async function convert() {
    setError(null);
    const res = await auth.api<ConvertResult>(`/api/v1/leads/${id}/convert`, { method: "POST" });
    if (res.success && res.data) setConverted(res.data);
    else setError(res.error?.message ?? "Conversion failed");
    await reload();
  }

  return (
    <View state={state}>
      {({ lead, briefs, sources, notes, opportunity, statusHistory }) => (
        <>
          <h2>{lead.companyName}</h2>
          {error ? <ErrorState title="Action failed" body={error} /> : null}
          <p>
            {lead.contactName} ({lead.jobTitle ?? "no title"}) · {lead.email} · intent {lead.intent}
          </p>
          <p>
            Status: <strong>{lead.status}</strong>{" "}
            {nextLeadStatuses(lead.status).map((to) => (
              <Button
                key={to}
                onClick={() => void act(`/api/v1/leads/${id}/status`, "PATCH", { status: to })}
              >
                Move to {to}
              </Button>
            ))}
            {lead.status === "qualified" ? (
              <Button onClick={() => void convert()}>Convert to customer</Button>
            ) : null}
          </p>
          {converted ? (
            <p role="status">
              Customer created. Invitation to {converted.invitation.email}{" "}
              {converted.invitation.emailDelivery === "sent"
                ? "sent."
                : "could not be emailed. Resend it from the customer page."}
            </p>
          ) : null}
          {lead.convertedTenantId ? (
            <Link href={`/console/customers/${lead.convertedTenantId}`}>Open customer</Link>
          ) : null}

          <h3>Brief</h3>
          <p>{lead.majorProblem ?? "No problem statement."}</p>
          {briefs.map((b) => (
            <p key={b.id}>{b.freeText}</p>
          ))}
          <p>
            Source:{" "}
            {sources
              .map(
                (s) =>
                  `${s.sourceType}${s.utmSource ? ` / ${s.utmSource}` : ""}${s.utmCampaign ? ` / ${s.utmCampaign}` : ""}`,
              )
              .join(", ") || "unknown"}
          </p>

          <h3>Discovery</h3>
          <Form onSubmit={(e) => void saveDiscovery(e)}>
            <Input label="Title" name="title" defaultValue={opportunity?.title ?? ""} required />
            <Input
              label="Business problems"
              name="businessProblems"
              defaultValue={opportunity?.businessProblems ?? ""}
            />
            <Input
              label="Pilot objectives"
              name="pilotObjectives"
              defaultValue={opportunity?.pilotObjectives ?? ""}
            />
            <Button type="submit">Save discovery</Button>
          </Form>

          <h3>Notes</h3>
          <ul>
            {notes.map((n) => (
              <li key={n.id}>
                {new Date(n.createdAt).toLocaleString()}: {n.body}
              </li>
            ))}
          </ul>
          <Form onSubmit={(e) => void addNote(e)}>
            <Input label="New note" name="body" maxLength={10000} />
            <Button type="submit">Add note</Button>
          </Form>

          <h3>Status history</h3>
          <ul>
            {statusHistory.map((h, i) => (
              <li key={i}>
                {new Date(h.at).toLocaleString()}: {h.payload.from} to {h.payload.to}
              </li>
            ))}
          </ul>
        </>
      )}
    </View>
  );
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <main>
      <Link href="/console/leads">All leads</Link>
      <RequireAuth staff>{(auth) => <LeadView auth={auth} id={id} />}</RequireAuth>
    </main>
  );
}
