# `@marketing-os/db`

Drizzle schema and SQL migrations for Marketing OS.

## Local database

```bash
npx supabase start
# Apply SQL in drizzle/ against the local Postgres URL from `supabase status`
```

Migrations in `drizzle/` are the schema source (ADR-0006). Generate ORM-aligned SQL with `pnpm --filter @marketing-os/db generate` after schema changes, then add RLS policies by hand.
