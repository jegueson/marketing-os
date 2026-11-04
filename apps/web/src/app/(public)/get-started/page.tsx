"use client";

import { useState, type FormEvent } from "react";
import { Button, Form, Input, ErrorState } from "@marketing-os/ui";
import { apiFetch } from "@/lib/api";

export default function GetStartedPage() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const website = String(form.get("website") ?? "");
    if (website) {
      setError("Submission rejected");
      return;
    }
    const body = {
      companyName: String(form.get("companyName") ?? ""),
      contactName: String(form.get("contactName") ?? ""),
      email: String(form.get("email") ?? ""),
      intent: String(form.get("intent") ?? "cloud_workspace"),
      notes: String(form.get("notes") ?? ""),
    };
    const res = await apiFetch<{ id: string }>("/api/v1/public/leads", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.success) {
      setError(res.error?.message ?? "Request failed");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <main>
        <h1>Thanks</h1>
        <p>A Success Manager will follow up shortly.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Get started</h1>
      {error ? <ErrorState title="Could not submit" body={error} /> : null}
      <Form onSubmit={onSubmit}>
        <Input label="Company" name="companyName" required />
        <Input label="Contact name" name="contactName" required />
        <Input label="Email" name="email" type="email" required />
        <label>
          Intent
          <select name="intent" defaultValue="cloud_workspace">
            <option value="expert_services">Expert services</option>
            <option value="cloud_workspace">Cloud workspace</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </label>
        <Input label="Notes" name="notes" />
        <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ display: "none" }} />
        <Button type="submit">Submit</Button>
      </Form>
    </main>
  );
}
