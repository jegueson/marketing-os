# Implementation plan v2

October 2026. This is the engineering plan for the open-source Marketing OS.

Read first:

- [objective.md](../objective.md)
- [tasks.md](../tasks.md)
- [prd_v3_addendum.md](prd_v3_addendum.md)
- [business_plan_v3_open_source.md](business_plan_v3_open_source.md)
- [docs/adr/README.md](../docs/adr/README.md)

The product requirements in `agentic_marketing_os_prd_cursor_v2.md` still define modules, entities, roles and the pilot. The addendum replaces the stack, the hosting and the distribution.

## Architecture

```text
Browser
  → Next.js Worker (public, portal, console)
  → service binding
  → Hono API Worker
       → Hyperdrive → Supabase Postgres (pgvector, RLS)
       → Supabase Auth (JWT verify only)
       → R2
       → Queues (from a Postgres outbox, via Cron)
       → Workflows (durable automations)
       → model gateway (OpenRouter and others)
       → connector SDK (GA4, Google Ads, Meta, HubSpot, Linear, Notion)
```

The browser never queries PostgREST. Provider SDKs stay inside adapter packages. Tenant settings on a pooled Hyperdrive connection are transaction-local.

## Repository layout

```text
apps/web                 Next.js on Workers
apps/api                 Hono API, queue consumers, cron, workflow entrypoints
apps/cli                 mos setup, deploy, migrate
packages/core            tenancy, rbac, audit, events, flags, errors, ports
packages/db              Drizzle schema, SQL migrations, RLS, seeds
packages/schemas         Zod schemas shared by API and UI
packages/api-client      generated client
packages/ui              unstyled functional primitives
packages/connector-sdk   connector contract and contract tests
packages/model-gateway   adapters and usage ledger (Sprint 3)
packages/metrics         metric definitions and values (Sprint 2)
packages/workflow        WorkflowPort and Cloudflare adapter (Sprint 4)
packages/policy          policy engine (Sprint 5)
modules/<domain>         lead-intake, onboarding, integrations, cockpit, ...
connectors/<provider>    mock first, then the pilot set
skills/                  starter library (Sprint 4)
customer-configs/        templates and examples
deploy/                  wrangler configs, docker-compose
e2e/                     Playwright
docs/                    adr, architecture, connectors, security, product
```

## Sequence

| Sprint | Outcome | Weeks (solo) |
| --- | --- | --- |
| 1 | Lead becomes a tenant, mock source, empty cockpit, local setup works, repo can go public | 6–7 |
| 2 | GA4, Google Ads, Meta, HubSpot sync into a cockpit with lineage | 6–8 |
| 3 | Ask Marketing with bring-your-own-key. Tag v0.1.0-alpha | 4–5 |
| Cloud (private repo) | Credits, provisioning, billing UI | 2–3 |
| 4 | Specialist configures skills and workflows without a code deploy. Starter skills published | 5–6 |
| 5 | One approved write lands in Linear. Tag v0.2.0 | 5–7 |
| Phase 5 | One expansion module at a time after a paying pilot | 3–5 each |

Task-level scope for Sprint 1 is in `tasks.md`. Do not start Sprint 2 connectors before the metric definition schema and credential encryption exist.

## Working method

For each task: write the failing test, implement the minimum, run the TypeScript reviewer and the code reviewer, and run the security reviewer when the change touches auth, tenancy, secrets or a public endpoint. Run the database reviewer on migrations. Commit with a conventional message when the task's "done when" line is true.

Coverage target for `packages/core`, modules and connectors is 80 percent or better.

Definition of done is PRD section 59 plus items 18–20 in the v3 addendum.

## Guardrails

Pilot connectors only. No marketplace. No autonomous media buying. No sales automation. No customer-facing workflow builder. No credit checkout in this repository. No visual design until mockups arrive. No autonomous agents in Sprints 1 and 2.

## Open decisions (non-blocking)

- Production email: Cloudflare Email Service or an HTTP provider. Decide in S1-T28.
- npm scope, product domain and trademark filing.
- Credit pack price. Validate with the first cloud customer. Not built here.
- Opt-in anonymous install ping: yes or no. Default in code is off.
