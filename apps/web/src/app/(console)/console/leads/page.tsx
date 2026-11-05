"use client";

import Link from "next/link";
import { useState } from "react";
import { leadStatuses } from "@marketing-os/core";
import { Button, EmptyState, Table } from "@marketing-os/ui";
import { RequireAuth, type ReadyAuth } from "@/components/auth";
import { useApi, View } from "@/components/api-view";

type LeadRow = {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  intent: string;
  status: string;
  createdAt: string;
};

const PAGE_SIZE = 20;

function Leads({ auth }: { auth: ReadyAuth }) {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (status) query.set("status", status);
  if (q.trim()) query.set("q", q.trim());
  const [state] = useApi<LeadRow[]>(auth.api, `/api/v1/leads?${query.toString()}`);
  const total = state.status === "ready" ? Number(state.meta?.["total"] ?? 0) : 0;

  return (
    <>
      <label>
        Status{" "}
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All</option>
          {leadStatuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>{" "}
      <label>
        Search{" "}
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Company, contact or email"
        />
      </label>
      <View state={state}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState title="No leads" body="New submissions from /get-started appear here." />
          ) : (
            <>
              <Table
                headers={["Company", "Contact", "Email", "Intent", "Status", "Received"]}
                rows={rows.map((lead) => [
                  <Link key="c" href={`/console/leads/${lead.id}`}>
                    {lead.companyName}
                  </Link>,
                  lead.contactName,
                  lead.email,
                  lead.intent,
                  lead.status,
                  new Date(lead.createdAt).toLocaleString(),
                ])}
              />
              <p>
                Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))} ({total} leads){" "}
                <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>{" "}
                <Button disabled={page * PAGE_SIZE >= total} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </p>
            </>
          )
        }
      </View>
    </>
  );
}

export default function LeadsPage() {
  return (
    <main>
      <h1>Leads</h1>
      <Link href="/console">Console</Link>
      <RequireAuth staff>{(auth) => <Leads auth={auth} />}</RequireAuth>
    </main>
  );
}
