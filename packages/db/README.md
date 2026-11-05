# `@marketing-os/db`

Typed Drizzle schema and database helpers for Marketing OS.

## Where the schema lives

SQL in `supabase/migrations` is the schema source (ADR-0006, amended
2026-11-05). `src/schema` is the typed layer and must match it.
`src/migrations.test.ts` applies every migration to PGlite and fails on drift.

## Local database

```bash
supabase start                # Postgres on 127.0.0.1:54322
supabase db reset --local     # apply every migration from scratch
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/tests/check_rls.sql
```

Apply only new migrations without wiping data: `supabase migration up --local`.

## Changing the schema

1. Edit `src/schema`.
2. Optional draft: `pnpm --filter @marketing-os/db generate` writes SQL to
   `packages/db/drizzle/` (gitignored).
3. Write the real migration as a new file in `supabase/migrations`, with RLS,
   grants and policies.
4. `pnpm --filter @marketing-os/db test` must pass (drift and RLS checks).

## Runtime

- `createDb(url)` uses postgres-js (Hyperdrive on Workers).
- `withContext(db, ctx, fn)` opens a transaction, runs `SET LOCAL ROLE app_api`
  and sets `app.tenant_id`, `app.user_id` and `app.staff` for RLS.
- `@marketing-os/db/testing` gives a migrated PGlite database for tests.
