# ADR-0025: Usage ledger, budget caps and versioned prompts

**Date**: 2026-11-13
**Status**: accepted
**Deciders**: product owner, architecture review

## Context

ADR-0017 requires every model call to write a usage-ledger row and keeps credit purchase behind `BillingProvider`. ADR-0016 keeps billing out of this repository. Sprint 3 also needs a prompt registry that can be evaluated and locked so a published prompt cannot change silently.

## Decision

1. **Usage ledger.** Append-only `usage_ledger` rows record tenant, workspace, user, run id, purpose, provider, model, prompt name and version, input/output tokens, `estimated_cost_micro_usd` (nullable bigint), cost basis, latency, status and error code. Rows never store prompt bodies, response bodies or tool payloads. Updates and deletes are rejected (same pattern as `audit_events`).

2. **Budget caps in-repo.** `model_budgets` holds an optional monthly cap in micro-USD and `enforcement: hard | warn`. Cap checks sum the UTC calendar month from the ledger before the provider call. Hard cap returns `budget_exceeded` without calling the provider. A hard cap cannot be saved for a model whose pricing is unknown. Concurrent overshoot under parallel requests is accepted and documented; exact serialisation is not required for v0.1.0-alpha.

3. **BillingProvider no-op.** This repo ships `BillingProvider` (`authorize`, `record`) and a no-op that only applies the optional cap. Credit balances and payment live in the private cloud package.

4. **Versioned prompt registry.** Prompts live in `packages/prompts` as code: name, version, purpose, system text, Zod bindings, Zod output schema, model constraints. `prompts.lock.json` stores a content hash per `name@version`. CI fails if published text changes without a version bump. Untrusted values are fenced as data when rendered. The registry reads from an abstract source so Sprint 4 can add a database-backed source without changing callers.

5. **Model credentials.** Tenant model keys use `tenant_model_config` plus a separate `model_credentials` table (ciphertext, nonce, key version, fingerprint) so a `select *` on config never returns secrets. Keys are sealed with the existing keyring (ADR-0008).

## Alternatives Considered

### Alternative 1: Store prompts only in the database from day one

- **Pros**: Editable without deploy.
- **Cons**: Harder to review and lock for the first eval suite.
- **Why not**: Sprint 3 needs reproducible golden questions. Sprint 4 adds DB-backed prompts behind the same registry port.

### Alternative 2: Enforce budgets only in the private cloud package

- **Pros**: Less public surface.
- **Cons**: Self-hosters lose a safety rail; cloud would still need the ledger.
- **Why not**: Caps are part of running the product; credits are not.

## Consequences

### Positive

- Self-hosters get cost visibility and optional hard caps without Stripe.
- Prompt changes are reviewable and eval-pinned by version.

### Negative

- Operators must bump the prompt version to change wording.
- Ledger cost is an estimate; provider invoices may differ.

### Risks

- A rolled-back request transaction must not erase the ledger row. The ledger write happens outside the caller's transaction.
