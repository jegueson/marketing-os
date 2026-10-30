# ADR-0001: Host on Cloudflare and Supabase

**Date**: 2026-10-28
**Status**: accepted
**Deciders**: product owner

## Context

The first plan hosted the web app on Vercel and the API on Render, with Supabase for Postgres and auth. The product must also be self-hosted by customers, and the owner wants one vendor for compute, files, queues and the edge.

## Decision

Run all application compute on Cloudflare. Use Supabase for Auth and Postgres (including pgvector). Use Hyperdrive to pool Postgres connections, R2 for files, Queues for jobs, Cron Triggers for schedules, and Workflows for durable automations.

## Alternatives Considered

### Alternative 1: Vercel plus Render plus Supabase

- **Pros**: Familiar Next.js and container hosting. Long-running Python processes are easy.
- **Cons**: Three vendors. Harder to hand a self-hoster a single deploy.
- **Why not**: The owner required Cloudflare plus Supabase only.

### Alternative 2: Cloudflare only, including D1

- **Pros**: One vendor.
- **Cons**: D1 is not Postgres. The data model needs Postgres features and pgvector.
- **Why not**: Supabase already matches the tenancy, auth and vector requirements.

## Consequences

### Positive

- One deploy story for the hosted product and for a customer Cloudflare account.
- Edge network, queues, workflows and object storage come from the same platform.

### Negative

- Worker CPU and subrequest limits constrain how much work a single request can do. Long work must be queued.
- Operators learn Wrangler and Hyperdrive instead of a container platform.

### Risks

- Next.js on Workers can lag framework releases. Pin the OpenNext adapter and test upgrades.
