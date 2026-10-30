# ADR-0018: Two deployment modes and two self-host targets

**Date**: 2026-10-28
**Status**: accepted
**Deciders**: product owner

## Context

The same binary must serve a company that self-hosts for one team, an agency that self-hosts for several clients, and the owner's multi-tenant cloud. Those audiences enter the product differently.

## Decision

`MOS_DEPLOYMENT_MODE` is `self_hosted` or `cloud`.

Self-hosted mode runs the setup wizard (`mos setup`), which creates the first admin, a tenant and a workspace, and stores a model key. Lead admin and billing UI are hidden unless enabled.

Cloud mode uses the lead form, Success Manager workspace and invitation flow. Credit purchase is still outside this repo.

Two install targets are supported:

1. The operator's own Cloudflare account plus their Supabase project (`mos deploy`).
2. The operator's machine (`pnpm dev` with the Supabase CLI and Wrangler, or Docker Compose).

Local mode is for a single team. It is not highly available. The operator owns backups. Docs state that.

## Alternatives Considered

### Alternative 1: Docker Compose as the only self-host path

- **Pros**: Familiar to self-hosters.
- **Cons**: Throws away the Cloudflare deploy the owner wants as the primary hosted shape.
- **Why not**: Both targets are required. Cloudflare is the primary. Local is the zero-account path.

### Alternative 2: A separate product for self-host

- **Pros**: Simpler cloud code.
- **Cons**: Two products. The owner asked for one open-source system.
- **Why not**: Mode flags and hooks are enough.

## Consequences

### Positive

- One codebase. Tests cover both the lead journey and the setup-wizard journey.

### Negative

- Features must say which modes they apply to. The definition of done requires both.

### Risks

- Cloud-only assumptions leak into core (a required Stripe key). `BillingProvider`'s no-op must boot with no payment secrets.
