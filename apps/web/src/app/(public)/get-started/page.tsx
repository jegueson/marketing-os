"use client";

import Script from "next/script";
import { useState, type FormEvent } from "react";
import { Button, Form, Input, ErrorState } from "@marketing-os/ui";
import { publicApi } from "@/lib/api";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

function text(form: FormData, key: string): string | undefined {
  const value = String(form.get(key) ?? "").trim();
  return value ? value : undefined;
}

export default function GetStartedPage() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams(window.location.search);
    const body = {
      companyName: text(form, "companyName"),
      contactName: text(form, "contactName"),
      email: text(form, "email"),
      jobTitle: text(form, "jobTitle"),
      intent: text(form, "intent") ?? "expert_services",
      majorProblem: text(form, "majorProblem"),
      notes: text(form, "notes"),
      website: String(form.get("website") ?? ""),
      turnstileToken: text(form, "cf-turnstile-response"),
      utmSource: params.get("utm_source") ?? undefined,
      utmMedium: params.get("utm_medium") ?? undefined,
      utmCampaign: params.get("utm_campaign") ?? undefined,
      referrer: document.referrer || undefined,
    };
    const res = await publicApi<{ id: string }>("/api/v1/public/leads", { method: "POST", body });
    setBusy(false);
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
      {TURNSTILE_SITE_KEY ? (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      ) : null}
      {error ? <ErrorState title="Could not submit" body={error} /> : null}
      <Form onSubmit={onSubmit}>
        <Input label="Company" name="companyName" required maxLength={200} />
        <Input label="Contact name" name="contactName" required maxLength={200} />
        <Input label="Work email" name="email" type="email" required />
        <Input label="Job title" name="jobTitle" maxLength={200} />
        <label>
          How can we help?
          <select name="intent" defaultValue="expert_services">
            <option value="expert_services">Expert services</option>
            <option value="cloud_workspace">Cloud workspace</option>
            <option value="enterprise_licence">Enterprise licence</option>
          </select>
        </label>
        <Input label="Your main marketing problem" name="majorProblem" maxLength={5000} />
        <Input label="Anything else we should know" name="notes" maxLength={5000} />
        <input
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: "absolute", left: "-10000px" }}
        />
        {TURNSTILE_SITE_KEY ? (
          <div className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} />
        ) : null}
        <Button type="submit" disabled={busy}>
          Submit
        </Button>
      </Form>
    </main>
  );
}
