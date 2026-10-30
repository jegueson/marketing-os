# ADR-0004: The API Worker is the only data path

**Date**: 2026-10-28
**Status**: accepted
**Deciders**: architecture review

## Context

Supabase exposes PostgREST and a client SDK. Using them from the browser is fast to build and easy to get wrong: a missing policy leaks a tenant, and business rules end up split between SQL policies and TypeScript.

## Decision

The browser uses Supabase only to obtain a session. Every read and write of application data goes to the Hono API. `anon` and `authenticated` have no privileges on application tables. Row-level security remains as a second line of defence (ADR-0005), not as the application API.

## Alternatives Considered

### Alternative 1: supabase-js in the browser, RLS as the API

- **Pros**: Less API code for simple CRUD.
- **Cons**: Complex writes (provisioning, audit, outbox) do not fit. Contributors bypass the domain layer.
- **Why not**: The product's writes are workflows, not forms over tables.

## Consequences

### Positive

- One place for validation, audit and tenancy checks.

### Negative

- Every new screen needs an API route. That is intentional.

### Risks

- Someone adds a Supabase client call later. CI should fail if application code imports the data API. Auth helpers are allowed.
