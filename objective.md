# Objective

Build **Marketing OS**: an open-source, marketing-only operating system that connects a team's existing marketing stack, shows it in one cockpit, answers questions about that data, and lets specialists configure skills, agents, workflows and governed automations.

The product thesis does not change:

**CONNECT → UNDERSTAND → DISPLAY → ASK → DESIGN → AUTOMATE → EXECUTE → MEASURE → IMPROVE**

## Distribution

The software is **AGPL-3.0** and published on GitHub.

- Anyone can self-host it, write their own skills, and connect their own model (OpenRouter first, or any OpenAI-compatible endpoint).
- Customers who want a marketing specialist to shape skills and systems contact the maintainer (paid Expert Services).
- Customers who do not want to host it use **Marketing OS Cloud**, a managed deployment where they buy **AI agent credits**.

The code that runs the product is public. Billing, credit purchase and cloud provisioning live in a private package behind interfaces defined in this repo.

## Boundaries

In scope: marketing analytics, paid media, SEO, CRO, creative and brand operations, CRM marketing, retention, leads, market intelligence, tracking and consent monitoring, marketing governance, reporting, and marketing work orchestration.

Out of scope: customer-service chatbots, call-center automation, generic sales automation, replacing a sales CRM, general employee copilots, and a public self-service agent marketplace.

## Stack

TypeScript only. Cloudflare Workers (Next.js web app, Hono API, Queues, Cron Triggers, Workflows, R2) plus Supabase (Auth, Postgres, pgvector). No Render. No Vercel.

## Success for the first public release

A new team can either:

1. Submit a lead, get provisioned on the cloud path, connect the mock source, and open an empty cockpit, or
2. Run `mos setup` locally, connect the mock source, and open the same cockpit,

and one tenant cannot read another tenant's data.

Pilot-ready means the full journey in PRD section 60 works on the pilot connector set (GA4, Google Ads, Meta Ads, HubSpot, Linear, Notion).

## North-star metrics

- Time to cockpit, time to first insight, time to first automation.
- Hours of recurring marketing work absorbed.
- Active self-hosted installs (opt-in) and conversion from self-host to services or cloud.
- Credit consumption and gross margin on the cloud.
- Connected sources per customer, automation success rate, recommendation acceptance.

## How this repo is built

One small task at a time from `tasks.md`. Tests first, then implementation, then review. Decisions live in `docs/adr/`. Product scope lives in `Planning/`.
