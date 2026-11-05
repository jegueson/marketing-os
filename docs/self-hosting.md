# Self-hosting Marketing OS

Two supported paths:

1. **Local machine**: Supabase CLI for Postgres, Auth and Mailpit; `wrangler dev`
   for the API; `next dev` for the web app.
2. **Your own Cloudflare account + Supabase project**: `pnpm mos deploy`.

## Local quickstart

Needs Node 22, pnpm, Docker and the Supabase CLI.

```bash
pnpm install
supabase start
supabase db reset --local          # applies supabase/migrations

cp apps/api/.dev.vars.example apps/api/.dev.vars
cp apps/web/.env.example apps/web/.env.local
supabase status -o env             # copy JWT_SECRET and ANON_KEY into the two files
```

In `apps/api/.dev.vars` set `SUPABASE_JWT_SECRET` (local Supabase signs with a
shared secret, so leave `SUPABASE_JWKS_URL` empty) and
`MOS_DATA_KEY=$(openssl rand -base64 32)`. In `apps/web/.env.local` set
`NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### First-run setup

`mos setup` creates the platform admin in Supabase Auth, the tenant, the
default workspace and the admin membership. It stores the model API key
encrypted under `MOS_DATA_KEY` in `apps/cli/.mos/setup.json`. Secrets come from
environment variables only, so they never show up in shell history as
arguments.

```bash
eval "$(supabase status -o env | grep -E '^(API_URL|DB_URL|SERVICE_ROLE_KEY)=')"
export DATABASE_URL=$DB_URL SUPABASE_URL=$API_URL SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
export MOS_DATA_KEY=<same value as apps/api/.dev.vars>
export MOS_ADMIN_PASSWORD=<at least 12 characters>
export MOS_MODEL_API_KEY=<OpenRouter key>
pnpm mos setup --email=you@example.com --tenant="My Team" --slug=my-team
```

Running it again is safe: it reports `created: false` and changes nothing.

```bash
pnpm dev                           # API on :8787, web on :3000
```

Sign in at http://127.0.0.1:3000/login. Invitation emails land in Mailpit at
http://127.0.0.1:54324.

## Deploying to your own Cloudflare account

```bash
pnpm --filter @marketing-os/api exec wrangler login
supabase link --project-ref <ref>
pnpm mos deploy --dry-run          # prints the steps
pnpm mos deploy
```

The steps are: check the wrangler login, `supabase db push`, deploy the API
Worker, build and deploy the web Worker. Before the first deploy, create the
Hyperdrive config, the `mos-outbox` and `mos-outbox-dlq` queues and the R2
buckets, and set the API secrets. [ops/cloudflare-staging.md](ops/cloudflare-staging.md)
lists every resource. The web build reads `NEXT_PUBLIC_API_BASE_URL`,
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the shell.

## Tests

```bash
pnpm test                          # unit and integration (PGlite)
pnpm test:e2e                      # API journeys (PGlite)
```

Browser journeys run against the local stack started above:

```bash
eval "$(supabase status -o env | grep -E '^(API_URL|DB_URL|SERVICE_ROLE_KEY)=')"
cd e2e
E2E_BASE_URL=http://127.0.0.1:3000 E2E_SUPABASE_URL=$API_URL \
E2E_SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY E2E_MAILPIT_URL=http://127.0.0.1:54324 \
E2E_DATABASE_URL=$DB_URL pnpm test
```

## Deployment mode

`MOS_DEPLOYMENT_MODE=self_hosted` hides cloud lead intake and the Leads console
unless feature flags enable them. `MOS_DEPLOYMENT_MODE=cloud` enables the
Success Manager lead-to-customer journey and requires Turnstile.

## Limits (local)

Single machine, no high availability. You own backups. Miniflare approximates
Queues, R2 and Cron. `wrangler dev` does not run the outbox cron by itself.
Start the API with `pnpm --filter @marketing-os/api exec wrangler dev --test-scheduled`
and trigger it with `curl "http://127.0.0.1:8787/__scheduled?cron=*/5+*+*+*+*"`.
