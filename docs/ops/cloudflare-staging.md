# Cloudflare + Supabase staging

Account: `4418a37aab853c3ba3653276d99486c6`  
Supabase project: `ilgxtbjjawnkvybvcsqm` (`marketing-os`, `eu-west-1`)

## Live URLs

| Service | URL |
| --- | --- |
| API | https://marketing-os-api.gabriel-candido.workers.dev |
| Web | https://marketing-os-web.gabriel-candido.workers.dev |
| Supabase | https://ilgxtbjjawnkvybvcsqm.supabase.co |

OAuth redirect for every provider app:

```text
https://marketing-os-api.gabriel-candido.workers.dev/api/v1/integrations/oauth/callback
```

Register that URI on the Google, HubSpot, and Meta apps when their rows in [../connectors/approvals.md](../connectors/approvals.md) move to `approved`. Mock OAuth does not need a provider app. The connector flags stay off, so those providers are not offered on staging until a flag is turned on.

Smoke:

```bash
curl -fsS https://marketing-os-api.gabriel-candido.workers.dev/healthz
curl -fsS https://marketing-os-api.gabriel-candido.workers.dev/readyz   # database: ok
curl -fsS -o /dev/null -w '%{http_code}\n' https://marketing-os-web.gabriel-candido.workers.dev/login
```

A mock sync needs a signed-in workspace, one selected scope, and `MOS_DATA_KEY`. The API cron (`*/5 * * * *`) relays the outbox and then enqueues due syncs on `mos-sync`.

## Provisioned resources

- Workers: `marketing-os-api`, `marketing-os-web`
- Queues: `mos-outbox` and `mos-outbox-dlq`; `mos-sync` and `mos-sync-dlq` (dead letters after 5 retries)
- Cron: `*/5 * * * *` on the API
- Rate limit: `PUBLIC_LEADS_RATE_LIMITER` (namespace `1001`, 5 requests / 60 s)
- Rate limit: `ASK_RATE_LIMITER` (namespace `1002`, 30 requests / 60 s per user)
- R2: `mos-assets`, `mos-assets-preview`
- Hyperdrive: `mos-supabase-staging` (`7e654828f81d45acb604296b2cfcc34e`) → `db.ilgxtbjjawnkvybvcsqm.supabase.co`
- DB role: `mos_hyperdrive` (LOGIN, no BYPASSRLS, member of `app_api`)
- Schema: migrations `0000`–`0021`. Remote versions match the local filenames. `0012` is timestamped after `0015` because that migration was recorded on retry; the statements do not depend on each other. `0017`–`0021` (Ask permissions, model credentials, usage ledger, budgets, conversations) were applied on 2026-11-20 with `supabase db push`.

## Worker bindings and vars

API:

- `HYPERDRIVE`, `ASSETS_BUCKET`, `OUTBOX_QUEUE`, `SYNC_QUEUE`, `PUBLIC_LEADS_RATE_LIMITER`, `ASK_RATE_LIMITER`
- `SUPABASE_URL`, `SUPABASE_JWKS_URL` (ES256 signing keys), `APP_ORIGIN`, `MOS_DEPLOYMENT_MODE=cloud`
- Secret: `MOS_DATA_KEY` (set 2026-11-13). The only copy outside Cloudflare is `.mos/staging-mos-data-key` on the machine that created it. Copy that file into the password manager and do not commit it. Losing it makes stored connector tokens unreadable.

Web (inlined at build time, all public):

- `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the `sb_publishable_…` key), `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- CI reads them from repo variables `STAGING_API_URL`, `STAGING_SUPABASE_URL`,
  `STAGING_SUPABASE_PUBLISHABLE_KEY`, `STAGING_TURNSTILE_SITE_KEY`.

GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set. The deploy workflow runs on a push to `main` that touches `apps/`, `packages/`, `connectors/`, or `deploy/`. It does not apply database migrations.

## Ask smoke (S3-T37)

API deploy `c1990f6f-8c3b-43b2-8d44-f0993dcc8006` is the `v0.1.0-alpha` tree (`badb2c0` on `demo/investor`). `ASK_RATE_LIMITER` is bound at 30 requests / 60 seconds. `GET /api/v1/workspaces/{id}/ask/conversations` returns 401 without a token. `/readyz` reports the database ok.

Not smoked yet:

- The web Worker is still the previous build. `GET /portal/ask` returns 404 until `apps/web` is deployed with `STAGING_API_URL`, `STAGING_SUPABASE_URL`, and `STAGING_SUPABASE_PUBLISHABLE_KEY`.
- No model API key was available in this session. Ask returns 422 `model_not_configured` until a tenant key is saved. Do not commit the key. Seal it from the Models page, or with `mos setup`, using the existing `MOS_DATA_KEY`.
- `ask_marketing` is still false. Enable it only for the smoke tenant:

```bash
psql "$DATABASE_URL" -c "update feature_flags set is_enabled = true where key = 'ask_marketing';"
```

Then sign in, connect Mock, select one scope, sync, open Ask, and ask `How much did we spend?`. The observation must be a tool number such as `mock.spend: 2550`, not a model-invented figure.

## Not yet configured

- **Turnstile**: `STAGING_TURNSTILE_SITE_KEY` is unset and the API has no `TURNSTILE_SECRET_KEY`. `POST /api/v1/public/leads` stays 503 until both exist.
- **Email**: `send_email` is not on the API Worker. Invitations report `emailDelivery: "failed"` until a sender domain is onboarded.
- **Provider OAuth apps**: redirect URI above is not registered in the Google, HubSpot, or Meta consoles. Those connectors stay behind their flags.

```bash
cd apps/api
echo -n "$TURNSTILE_SECRET_KEY" | pnpm exec wrangler secret put TURNSTILE_SECRET_KEY
echo -n "$MOS_DATA_KEY" | pnpm exec wrangler secret put MOS_DATA_KEY
```

On rotation, set `MOS_DATA_KEY` to the new key, `MOS_DATA_KEY_VERSION` to the next integer, and keep the previous value as `MOS_DATA_KEY_V1` until every credential row has been read. See the self-host guide.

## Deploy commands

```bash
pnpm --filter @marketing-os/api exec wrangler deploy
cd apps/web && NEXT_PUBLIC_API_BASE_URL=… NEXT_PUBLIC_SUPABASE_URL=… \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=… pnpm run deploy
```

Shell values override `apps/web/.env.local`, so a local file never leaks into
a staging build. The build writes `apps/web/.next`, which `next dev` also uses:
restart the dev server (after `rm -rf apps/web/.next`) when you deploy from a
working copy.

## New migrations

Apply with Supabase MCP `apply_migration`, then rename the local file to the
version it recorded (`list_migrations`). Keeping the versions equal lets
`supabase db push` skip migrations that already ran. Apply one migration at a
time. Parallel applies can collide on the same version second and roll back.
