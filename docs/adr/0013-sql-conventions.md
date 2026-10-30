# ADR-0013: SQL type conventions

**Date**: 2026-10-28
**Status**: accepted
**Deciders**: database review

## Context

Postgres enums take a heavy lock to extend. Random UUIDs as primary keys on append-only tables fragment indexes. Floating point is the wrong type for money and ratios a CMO will compare.

## Decision

- Status and role columns are `text` with a `check` constraint.
- Low-volume entities use `uuid` primary keys (`gen_random_uuid()`).
- Append-only high-volume tables (`audit_events`, `sync_runs`, `outbox_events`, later `metric_values`) use `bigint generated always as identity`.
- Metric values and money use `numeric`. Money is integer minor units plus a currency code.
- Timestamps are `timestamptz`. Mutable tables have `created_at` and `updated_at`. Append-only tables have no `updated_at`.
- JSONB is for provider payloads, policy documents and skill definitions. It is not for identifiers, status or anything the cockpit filters on.

## Alternatives Considered

### Alternative 1: Postgres enum types

- **Pros**: Self-documenting in the catalog.
- **Cons**: Adding a value is an awkward migration.
- **Why not**: The status sets will grow during the pilot.

## Consequences

### Positive

- Migrations that add a status are a check-constraint change.

### Negative

- Invalid strings are possible if a migration forgets the check. Reviews look for it.

### Risks

- None beyond ordinary migration review.
