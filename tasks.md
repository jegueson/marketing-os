# Tasks

Status: `todo` | `doing` | `done`. Work one task at a time. Tests first. Update this file when a task moves.

Source of scope: `Planning/prd_v3_addendum.md` and `Planning/implementation_plan_v2.md`.

Critical path: T01 → T05 → T09 → T11 → T13 → T15 and T16 → T20 → T23–T25 → T27 → T28 → T29 → T33 → T34 and T35 → T38 and T39 → T37 → T40. T03 starts in week 1 and is not code. T31 and T32 can fill gaps.

---

# Sprint 1 — skeleton and open-source foundation (6–7 weeks)

## Foundations

### S1-T01 Monorepo scaffold — done

pnpm workspace, TypeScript strict, ESLint, Prettier, Vitest, `.env.example`, `.dev.vars.example`, `.gitignore`.

- Tests first: a trivial Vitest test runs from `pnpm test` on a clean clone.
- Done when: `pnpm test` and `pnpm typecheck` pass.

### S1-T02 Project docs — done

`objective.md`, `tasks.md`, business plan v3, PRD addendum, implementation plan v2, ADRs 0001–0018, Sprint 1 schema, GitHub package.

- Done when: README links objective, tasks, licence, commercial offers and ADRs.

### S1-T03 External approvals — todo

Not code. Week 1. Google OAuth consent and verification, Google Ads developer token, Meta app and App Review plan, HubSpot, Linear and Notion apps. Record redirect URIs in `docs/connectors/approvals.md`.

- Done when: every application is submitted and its status is written down.

### S1-T04 CI — todo

GitHub Actions: lint, typecheck, unit tests, gitleaks. Dependabot and CodeQL configs land with the GitHub package.

- Tests first: the workflow fails when a test is broken.
- Done when: pull requests cannot merge on red, and the job is under 10 minutes.

### S1-T05 Supabase and migrations — todo

Supabase CLI for local Postgres. drizzle-kit SQL migrations. First migration enables `vector` and `pgcrypto`. CI boots Supabase and applies migrations.

- Tests first: extensions exist after migrate.
- Done when: `supabase db reset` plus migrate works locally and in CI.

### S1-T06 API Worker skeleton — todo

Hono on Workers, Zod OpenAPI, env validation that fails fast, `/healthz` and `/readyz`, response envelope `{ success, data, error, meta }`, typed errors, JSON logs with `request_id`, CORS limited to the app origin, observability and traces enabled.

- Tests first: healthz returns 200; missing binding fails startup; an unhandled error returns the envelope and no stack trace.
- Done when: `wrangler dev` serves the API.

### S1-T07 Web app and UI primitives — todo

Next.js via OpenNext on Workers. Route groups `(public)`, `(portal)`, `(console)`. Service binding to the API. `packages/ui`: Button, Input, Form, Table, EmptyState, ErrorState. No visual design.

- Tests first: render smoke tests for each primitive.
- Done when: the app builds in CI.

### S1-T08 Walking-skeleton deploy — todo

Staging Supabase project, Hyperdrive, Workers for web and API, a Queue, an R2 bucket, secrets per environment, deploy workflow that applies migrations.

- Tests first: post-deploy smoke hits `/healthz` and the app root.
- Done when: staging URLs respond and secrets exist only in Cloudflare and Supabase.

## Identity, tenancy, security

### S1-T09 Tenancy schema — todo

`tenants`, `workspaces`, `profiles` (mirror of `auth.users`), `tenant_memberships`, `staff_assignments`.

- Tests first: unique membership, foreign keys, cascade behaviour, schema drift check.
- Done when: migrations apply and the drift check passes.

### S1-T10 RBAC catalog — todo

Permissions in code (`leads:read`, `leads:convert`, `tenants:provision`, `integrations:manage`, `cockpit:view`, `audit:read`, and the rest of the PRD section 5 matrix). Seed `permissions` and `role_permissions`.

- Tests first: role-by-permission matrix; unknown permission throws; default deny.
- Done when: the matrix matches PRD section 5.

### S1-T11 RLS and isolation harness — todo

Role `app_api` without `BYPASSRLS`. `app.current_tenant_id()`. Default-deny policies. Revoke `anon` and `authenticated` on application tables.

- Tests first: tenant A sees zero rows of tenant B; inserting B's `tenant_id` fails; any tenant table without RLS fails CI.
- Done when: the isolation suite is green in CI.

### S1-T12 API authentication — todo

Verify Supabase JWTs with `jose` against the JWKS. `getPrincipal` returns user id, staff roles and memberships.

- Tests first: valid token passes; expired, wrong audience, bad signature and missing token return 401.
- Done when: every non-public route requires a principal.

### S1-T13 Tenant context — todo

Resolve workspace from the path. Check membership or staff assignment. Run queries inside a transaction that sets `app.tenant_id` and `app.user_id` with `set_config(..., true)`. `requirePermission`. Separate staff context for lead routes.

- Tests first: non-member gets 403; unassigned staff gets 403; an unfiltered query still returns only the current tenant.
- Done when: no tenant route runs without a tenant context.

### S1-T14 Observability — todo

Workers Logs and Traces. `request_id`, `tenant_id` and `user_id` on log lines. Redact emails and tokens.

- Tests first: log records contain the ids; a fixture email and token are redacted.
- Done when: traces are visible in the Cloudflare dashboard on staging.

### S1-T15 Audit foundation — todo

Append-only `audit_events` (bigint identity). Revoke `UPDATE` and `DELETE`. Trigger that raises. `audit.record()` writes in the same transaction. Login audit.

- Tests first: update and delete raise; a rolled-back transaction leaves no audit row.
- Done when: the application role cannot change an audit row.

### S1-T16 Outbox and Queues — todo

`outbox_events`. Typed event envelope. `tenant_id` required except an allowlist (`lead.created`). Cron relay to Cloudflare Queues. Idempotent consumer. Dead-letter queue.

- Tests first: the event commits and rolls back with the transaction; relay is idempotent; a tenant event without `tenant_id` throws.
- Done when: staging processes a test event.

### S1-T17 Feature flags and deployment mode — todo

`feature_flags` and tenant overrides. `MOS_DEPLOYMENT_MODE=self_hosted|cloud`. `GET /api/v1/me/features`. `useFeature` hook.

- Tests first: tenant override beats platform default; unknown flag is false.
- Done when: navigation items follow flags, and self-hosted mode hides lead admin.

### S1-T18 OpenAPI client — todo

Generate `packages/api-client` from the Zod OpenAPI spec. CI fails if the generated client is stale.

- Tests first: the client parses success and error envelopes.
- Done when: the web app imports only generated API types.

## Lead intake

### S1-T19 Lead schema — todo

`leads`, `lead_briefs`, `lead_sources`. Platform-scoped, staff-only. PII columns commented.

- Tests first: a customer and `anon` cannot read leads; staff with `leads:read` can.
- Done when: isolation tests cover these tables.

### S1-T20 Public lead API — todo

`POST /api/v1/public/leads`. Shared Zod schema, length limits, honeypot, Turnstile verifier (mockable), rate limit, 24-hour email dedupe, `lead.created` event, audit.

- Tests first: 201, 422, 429, 400 on captcha failure, duplicate returns the same lead.
- Done when: abuse controls are covered and no auth is required.

### S1-T21 Lead form UI — todo

`/get-started` with intent: expert services, cloud workspace, enterprise licence. States: submitting, success, field errors, rate limited.

- Tests first: schema tests and component state tests.
- Done when: a staging submission creates a lead.

### S1-T22 Staff login — todo

Supabase session via `@supabase/ssr`. Console routes require a staff role from `GET /api/v1/me`.

- Tests first: non-staff gets 403; missing session redirects to login.
- Done when: only staff open console routes.

### S1-T23 Lead list — todo

`GET /api/v1/leads` with pagination, status filter and search. Console table.

- Tests first: requires `leads:read`; filter and page metadata are correct.
- Done when: staff see leads from the public form.

### S1-T24 Lead state machine — todo

Pure transitions: NEW → CONTACTED → DISCOVERY → QUALIFIED → CONVERTED. DISQUALIFIED from any non-terminal state. `PATCH` audits every change.

- Tests first: full transition table; illegal transition returns 409.
- Done when: status history is visible.

### S1-T25 Discovery record — todo

Append-only `success_manager_notes`. `opportunities` holds problems, stack map, pilot objectives, desired outcomes and recommended integrations.

- Tests first: only staff can write; notes cannot be edited.
- Done when: a Success Manager can record discovery on a lead.

## Provisioning

### S1-T26 Onboarding template — todo

`onboarding_projects` and `onboarding_checklist_items`. Default checklist in `customer-configs/_templates/onboarding.yaml`, validated on load.

- Tests first: invalid YAML is rejected; RLS holds.
- Done when: the template loads.

### S1-T27 Provisioning service — todo

One transaction: tenant, default workspace, opportunity link, Success Manager assignment, onboarding project, pending invitation, `customer.provisioned`, audit. Second conversion returns 409. Calls `ProvisioningHooks` (no-op in this repo).

- Tests first: happy path creates every row; a thrown error rolls all of them back; requires `tenants:provision`.
- Done when: a console action converts a qualified lead.

### S1-T28 Invitations and email — todo

`invitations` stores a hash of the token, expiry and role. `EmailSender` port. Dev adapter writes to local Mailpit. Production adapter is chosen in this task (Cloudflare Email Service or an HTTP provider). Resend rotates the token. Revoke works.

- Tests first: only the hash is stored; expired, reused and revoked tokens fail.
- Done when: Mailpit receives a working invite link.

### S1-T29 Invite acceptance and customer login — todo

`/invite/[token]`. Membership is created only when the account email matches. Portal routes require a session. Workspace switcher. Login audit.

- Tests first: email mismatch returns 403; token is single-use; `/app` without a session redirects.
- Done when: an invited admin lands in their workspace.

### S1-T30 Onboarding checklist UI — todo

`GET` and `PATCH /api/v1/workspaces/{id}/onboarding`. Portal home shows the list. Console view is read-only. `integration.connected` completes the "connect a source" item.

- Tests first: another tenant's checklist is denied; the auto-complete handler runs.
- Done when: connecting mock marks the item done.

## Connectors, cockpit, console

### S1-T31 Connector SDK v0 — todo

TypeScript `Connector` interface: metadata, authenticate, test connection, list and get resources, schema, query, query metrics, health, tools, actions. Zod models include lineage on metric results and risk, approval, idempotency and rollback on actions. Error classes: auth expired, access revoked, permission changed, rate limited, API version error. Contract test kit. Authoring notes in `docs/connectors/contract.md`.

- Tests first: the kit fails an incomplete fake and passes a complete one.
- Done when: the SDK imports no vendor SDK.

### S1-T32 Mock connector — todo

Deterministic campaigns, spend, sessions, conversions and leads. Selectable accounts. Configurable failures.

- Tests first: passes the contract kit; failures raise the typed errors; same input gives the same output.
- Done when: it is registered in the connector catalog.

### S1-T33 Connections API — todo

Tables `connectors`, `connections`, `credential_references` (ciphertext and key version, never plaintext), `data_scopes`. Endpoints to list, create, test, set scopes and delete. Events `integration.connected` and `integration.failed`. Audit on connection and scope changes.

- Tests first: RLS; requires `integrations:manage`; no scopes are selected by default; a failed test returns an actionable error code.
- Done when: a mock connection with explicit scopes reports health.

### S1-T34 Integrations page — todo

Catalog, then account, scopes, test and health. Errors explain how to fix them. Real providers show as coming soon behind flags.

- Tests first: component tests for each step and error state.
- Done when: a customer connects mock without help.

### S1-T35 Cockpit shell — todo

Portal nav from PRD section 7.1, filtered by flags. `GET /api/v1/workspaces/{id}/cockpit` returns `CockpitView`: period, freshness, empty KPI cards, empty attention queue, empty recommendations, populated data health.

- Tests first: schema contract; empty state renders; tenant isolation.
- Done when: the shell shows real connection health.

### S1-T36 Specialist console shell — todo

Nav from PRD section 7.2. Unbuilt sections are flagged placeholders. Customer list is limited to assigned tenants. Overview shows discovery, onboarding and connections. Audit view is read-only.

- Tests first: unassigned staff cannot open the tenant; audit requires `audit:read`.
- Done when: a Success Manager sees the converted customer.

## Self-host and release

### S1-T37 End-to-end and security pass — todo

Playwright: lead → convert → invite from Mailpit → accept → connect mock → cockpit. Second journey: setup wizard → login → connect mock → cockpit. Negative test: tenant B cannot read tenant A. Checklist: CORS, security headers, rate limits, secret scan, errors that do not leak data.

- Tests first: write the journeys before fixing what they find.
- Done when: both journeys pass and the checklist is recorded in `docs/security/s1-review.md`.

### S1-T38 Setup wizard — todo

`mos setup`: deployment mode, first platform admin, tenant and workspace, model provider (OpenRouter default) and encrypted key, starter-skill seed hook.

- Tests first: second run is safe; weak or missing config is refused; secrets are not printed.
- Done when: a fresh database becomes a usable single-tenant install.

### S1-T39 Local and Cloudflare install paths — todo

`pnpm dev` (Supabase CLI + wrangler). `deploy/docker-compose.yml`. `mos deploy` for the user's own Cloudflare account. Deploy button config.

- Tests first: CI runs the local self-host journey.
- Done when: the getting-started doc matches the commands.

### S1-T40 GitHub package and public pre-alpha — todo

README, licence, contributing, code of conduct, security, support, governance, commercial, trademarks, CLA note, issue and PR templates, CODEOWNERS, Dependabot, CodeQL, Changesets. Run the secret and internal-reference scan before flipping the repo to public.

- Done when: the scan is clean and the default branch is public as pre-alpha.

---

# Sprint 2 — connected cockpit (backlog, 6–8 weeks)

- OAuth on the API Worker: PKCE, state store, refresh, reconnection errors.
- Credential encryption with key version and rotation. Never log secrets.
- Read connectors: GA4, Google Ads, Meta Ads, HubSpot.
- Sync engine on Queues and Cron: manual and scheduled, 90-day backfill, incremental, rate limits.
- Scope selection UI. Nothing imports without an explicit scope.
- Metrics package: versioned definitions, numeric values with lineage, tenant `metrics.yaml`. `QualifiedLeadCAC` is not `LeadCAC`.
- Data health: status, freshness, volume, schema, errors, permissions.
- Cockpit widgets: executive, performance, funnel, leads, data health. Every KPI shows value, previous period, target, delta, source, freshness.
- Connector authoring guide.

Exit: pilot sources sync daily; at least eight configurable KPIs; reconnect works for expired and revoked tokens; no number without lineage.

# Sprint 3 — Ask Marketing (backlog, 4–5 weeks)

- Model gateway: OpenRouter, OpenAI-compatible, OpenAI, Anthropic.
- Usage ledger and per-tenant budget caps. `BillingProvider` no-op.
- Versioned prompt registry.
- Ask pipeline: intent, tenant context, metric catalog, typed read-only query plan, validation, answer. No model-written SQL.
- Evidence: sources, range, filters, freshness, quality warnings, assumptions. Separate observed data from interpretation.
- Streaming UI and conversation history.
- Golden-question eval suite (25+). Cross-tenant prompt leak test.

Exit: tag `v0.1.0-alpha`.

# Cloud track — private repo (backlog, 2–3 weeks, after Sprint 3)

- Stripe credit packs and balance enforcement through `BillingProvider`.
- Provision a cloud tenant from a converted lead.
- Billing UI and hosted marketing site.
- This work does not land in the public repo.

# Sprint 4 — specialist configuration (backlog, 5–6 weeks)

- Business profile, brand profile, knowledge (Notion, R2 uploads, pgvector, tenant-scoped).
- Prompt, skill and agent versioning. Tool allowlists from connector tool specs.
- Workflow definitions on Cloudflare Workflows behind `WorkflowPort`.
- Test-run UI. YAML import and export.
- Generic REST connector.
- Starter skill library and "writing skills" guide.

Exit: weekly performance review exists as configuration on the pilot tenant and runs on the mock tenant. Tag is not required yet.

# Sprint 5 — managed work (backlog, 5–7 weeks)

- Recommendations, policy engine, approvals with expiry, actions with idempotency.
- Linear `create_issue` as the first write connector.
- Triggers: schedule, manual, threshold.
- Outcome tracking and workload-absorbed value view.
- Audit log UI.
- Two to five pilot workflows, two of them reliable for two weeks.

Exit: one approved action lands in Linear and its outcome is stored. Tag `v0.2.0`. PRD section 60 and the self-host path in the v3 addendum both pass.

# Phase 5 — after a paying pilot (backlog)

One module at a time, behind a flag: paid-media writes with budget guardrails, lead engine, CRM and retention, brand studio (ComfyUI as a tool connector), SEO (Search Console), CRO, market intelligence, tracking and consent.

# Do not build before the pilot

More connectors than the pilot set. A marketplace. Autonomous media buying. Sales automation. A customer-facing workflow builder. Credit checkout in this repo. Cross-customer benchmarks. Visual design before mockups. Autonomous agents in Sprints 1 and 2.
