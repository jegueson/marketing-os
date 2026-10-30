# PRD v3 addendum
## Open-source distribution, Cloudflare, TypeScript
### October 2026

This addendum amends [agentic_marketing_os_prd_cursor_v2.md](agentic_marketing_os_prd_cursor_v2.md). Sections not mentioned here remain in force. Where they conflict, this addendum wins.

---

# A. Distribution model (amends sections 1, 4 and 6)

The product is open source (AGPL-3.0) and installable by the customer.

Two deployment modes, set by `MOS_DEPLOYMENT_MODE`:

| Mode | Who installs | How a user enters | Model keys |
| --- | --- | --- | --- |
| `self_hosted` | The customer, on their Cloudflare account or on their own machine | Setup wizard creates the first admin, tenant and workspace | Customer bring-your-own-key |
| `cloud` | The company | Lead form, Success Manager, then provisioned invitation (PRD section 6) | Platform key, metered as credits |

The lead form is the door to **paid expert help, a cloud workspace, or an enterprise licence**. It is not required to use the software.

Self-hosted single-team installs hide lead intake and billing UI unless an operator turns them on. Agencies that self-host for several clients keep multi-tenancy, the specialist console and the Success Manager workspace. Those stay in the public product.

There is still no public self-service signup and no public checkout for the cloud.

---

# B. Commercial surfaces (amends section 7)

Customer portal navigation is unchanged.

Add, cloud mode only:

- Usage and credits (read-only balance in the public UI; purchase flow is private).
- "Get expert help" link to the lead form.

Specialist console navigation is unchanged. It is how a self-hoster's own operator, or a contracted specialist, configures the tenant.

---

# C. Model gateway (replaces the provider list in section 13)

`ModelGateway` stays provider-neutral. Business logic never imports a vendor SDK.

Adapters, in build order:

1. OpenRouter (default for self-host docs).
2. Generic OpenAI-compatible HTTP (covers Ollama, LM Studio, vLLM and similar).
3. OpenAI.
4. Anthropic.

Required methods stay: list models, capabilities, complete, stream, embed, estimate cost.

Key handling:

- Self-hosted: per-tenant encrypted key. The platform never sees a key it does not store for that tenant.
- Cloud: platform key. Every call writes a usage-ledger row (tenant, model, tokens, estimated cost, latency, run id).

The public repo ships a `BillingProvider` interface and a no-op implementation that only enforces optional budget caps. Credit purchase and hard cut-off when the balance is zero are implemented in the private cloud package.

---

# D. Data architecture (replaces section 38)

| Concern | Choice |
| --- | --- |
| Language | TypeScript, strict, end to end |
| Web | Next.js on Cloudflare Workers via the OpenNext adapter. One app. Route groups: public, portal, console |
| API | Hono on Cloudflare Workers, OpenAPI from Zod |
| Database | Supabase Postgres + pgvector. Drizzle ORM. SQL migrations are the schema source |
| Connection pooling | Cloudflare Hyperdrive |
| Auth | Supabase Auth. The API verifies the JWT. The browser does not query PostgREST |
| Files | Cloudflare R2 |
| Jobs | Transactional outbox in Postgres, relayed to Cloudflare Queues |
| Schedules | Cron Triggers |
| Durable workflows | Cloudflare Workflows behind a `WorkflowPort` |
| Rate limiting | Workers Rate Limiting binding |
| Logs and traces | Workers Logs and Traces, OpenTelemetry export when configured |
| Bot protection on the lead form | Cloudflare Turnstile |

Removed: Python, FastAPI, SQLAlchemy, Redis, Render, Vercel, S3.

Python Workers were rejected because the runtime only loads pure-Python packages, and the Postgres drivers this system needs are native. One language also keeps the project contributable.

---

# E. Self-host requirements (new)

The repository must support both:

1. **Own Cloudflare account.** A documented deploy that creates Hyperdrive, Queues, R2, Workflows and secrets, runs migrations against the user's Supabase project (cloud or self-hosted), and seeds starter skills.
2. **Local machine.** `pnpm dev` runs the Supabase CLI and `wrangler dev`. A Docker Compose file is provided for the same topology. Document the limits: one machine, no high availability, the operator owns backups.

`mos setup` must:

- set the deployment mode,
- create the first platform admin,
- create a tenant and a default workspace,
- store a model provider and key (OpenRouter by default),
- note that starter skills are installed,
- never print secrets.

Ordinary customer configuration still follows section 58: YAML import and export, database is the runtime source, no code deploy for a new prompt or skill.

---

# F. Repository and API (amends sections 41 and 50)

The layout in the implementation plan replaces section 50. Packages are TypeScript (`packages/*`), not Python. Connectors, skills and customer configs stay first-class directories.

API namespaces in section 41 stay. Add:

- `GET /api/v1/me`
- `GET /api/v1/me/features`
- `GET /api/v1/usage` (ledger summary for the tenant)

Public lead intake is `POST /api/v1/public/leads`.

---

# G. Security (amends section 39)

Tenant isolation is three layers, all required:

1. The API checks the caller's membership for the tenant in the path.
2. Each request runs in a transaction that sets `app.tenant_id` and `app.user_id`.
3. Postgres row-level security on every tenant table reads those settings.

The database role used by the API does not bypass row-level security. Queue and Workflow code sets the same settings from the job payload and checks that the resource belongs to that tenant.

Hyperdrive pools connections, so tenant settings are transaction-local (`set_config(..., true)`). Session-level settings are forbidden.

---

# H. Pilot scope changes (amends sections 46 and 53)

Sprint 1 adds, on top of section 53:

- deployment mode,
- setup wizard,
- local install path,
- the GitHub documentation set (README, licence, contributing, security, support).

Pilot connectors are fixed: GA4, Google Ads, Meta Ads, HubSpot, Linear, Notion, mock, generic REST.

Section 47 (what not to build) is unchanged, plus: do not build credit checkout in the public repo, and do not build visual design until mockups arrive.

---

# I. Definition of done (adds to section 59)

For anything a self-hoster touches:

18. Public docs exist (install, configure, or extend).
19. It works with `MOS_DEPLOYMENT_MODE=self_hosted` and with `cloud`.
20. No secret is required that only the company's Cloudflare account can provide, except inside the private cloud package.

---

# J. Master prompt amendment (amends section 52)

Replace the architecture block of the Cursor master prompt with:

```text
ARCHITECTURE
TypeScript only.
- Next.js on Cloudflare Workers (OpenNext)
- Hono + Zod on Cloudflare Workers
- Drizzle + Supabase Postgres + pgvector
- Hyperdrive, Queues, Cron Triggers, Workflows, R2
- Supabase Auth

The browser never queries PostgREST.
Business logic never imports a model or marketing-platform SDK.
Model gateway: OpenRouter first, then any OpenAI-compatible endpoint, OpenAI, Anthropic.
Self-host is a first-class mode. Billing and credit purchase are not in this repo.
Default autonomy is OBSERVE.
Licence is AGPL-3.0. Do not add proprietary code to this repository.
```

---

# K. Final product test (amends section 60)

Add a second path that must also pass:

```text
Operator clones the repo
  ↓
mos setup (local or their Cloudflare account)
  ↓
Connects a model key
  ↓
Connects the mock source (later, a real source)
  ↓
Cockpit appears
  ↓
Asks a question
  ↓
Answer is grounded in that tenant's data
  ↓
Operator configures a skill without a code deploy
```

The cloud path in section 60 remains the test for the managed service.
