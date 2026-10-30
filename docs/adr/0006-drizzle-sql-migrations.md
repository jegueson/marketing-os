# ADR-0006: Drizzle SQL migrations are the schema source

**Date**: 2026-10-28
**Status**: accepted
**Deciders**: database review (adapted from the earlier Alembic recommendation)

## Context

The database review recommended Alembic because the API was Python. The API is now TypeScript (ADR-0002). Supabase also has its own migration folder. Two migration histories diverge.

## Decision

Drizzle schema files generate SQL migrations with drizzle-kit. Row-level security, triggers and grants are hand-written SQL in that same migration stream. Supabase CLI is used to run a local database and to apply the SQL. It is not a second source of schema. A drift check compares the Drizzle schema to the database after migrations.

## Alternatives Considered

### Alternative 1: Supabase Dashboard or supabase/migrations as the source

- **Pros**: Easy to click.
- **Cons**: No reviewable history tied to the TypeScript types.
- **Why not**: Schema changes must land in pull requests.

### Alternative 2: Keep Alembic beside Drizzle

- **Pros**: None once the API is TypeScript.
- **Cons**: Two tools, two languages.
- **Why not**: The Alembic recommendation assumed a Python API.

## Consequences

### Positive

- Table types and SQL stay in one toolchain.

### Negative

- drizzle-kit does not express RLS. Those statements are custom SQL and must be reviewed by hand.

### Risks

- Editing a migration that already ran in staging. Never do this. Add a new migration.
