# Cloudflare + Supabase staging

Account: `4418a37aab853c3ba3653276d99486c6`  
Supabase project: `ilgxtbjjawnkvybvcsqm` (`marketing-os`, `eu-west-1`)

## Live URLs

| Service | URL |
| --- | --- |
| API | https://marketing-os-api.gabriel-candido.workers.dev |
| Web | https://marketing-os-web.gabriel-candido.workers.dev |
| Supabase | https://ilgxtbjjawnkvybvcsqm.supabase.co |

Smoke:

```bash
curl -fsS https://marketing-os-api.gabriel-candido.workers.dev/healthz
curl -fsS https://marketing-os-api.gabriel-candido.workers.dev/readyz   # database: ok
curl -fsS -o /dev/null -w '%{http_code}\n' https://marketing-os-web.gabriel-candido.workers.dev/login
```

## Provisioned resources

- Workers: `marketing-os-api`, `marketing-os-web`
- Queues: `mos-outbox` (API is producer and consumer), `mos-outbox-dlq` (dead letters after 5 retries)
- Cron: `*/5 * * * *` on the API relays the outbox to the queue
- Rate limit: `PUBLIC_LEADS_RATE_LIMITER` (namespace `1001`, 5 requests / 60 s)
- R2: `mos-assets`, `mos-assets-preview`
- Hyperdrive: `mos-supabase-staging` (`7e654828f81d45acb604296b2cfcc34e`) → `db.ilgxtbjjawnkvybvcsqm.supabase.co`
- DB role: `mos_hyperdrive` (LOGIN, no BYPASSRLS, member of `app_api`). Created by hand; migration 0007 grants `app_api` when the role exists.
- Schema: migrations `0000`–`0007` applied through Supabase MCP `apply_migration`. Local file versions match the staging history.

## Worker bindings and vars

API:

- `HYPERDRIVE`, `ASSETS_BUCKET`, `OUTBOX_QUEUE`, `PUBLIC_LEADS_RATE_LIMITER`
- `SUPABASE_URL`, `SUPABASE_JWKS_URL` (ES256 signing keys), `APP_ORIGIN`, `MOS_DEPLOYMENT_MODE=cloud`

Web (inlined at build time, all public):

- `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the `sb_publishable_…` key), `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- CI reads them from repo variables `STAGING_API_URL`, `STAGING_SUPABASE_URL`,
  `STAGING_SUPABASE_PUBLISHABLE_KEY`, `STAGING_TURNSTILE_SITE_KEY`.

## Not yet configured

- **Turnstile**: create a widget for the web hostname, then
  `wrangler secret put TURNSTILE_SECRET_KEY` on the API and set
  `STAGING_TURNSTILE_SITE_KEY`. Until then `POST /api/v1/public/leads` returns 503.
- **Email**: the `send_email` binding needs a sender domain onboarded to
  Cloudflare Email Routing. Until then invitations report `emailDelivery: "failed"`.
- **MOS_DATA_KEY**: required before a connection stores credentials. Keep the previous value as `MOS_DATA_KEY_V1` when you rotate, and back it up outside Cloudflare. See the self-host guide.

```bash
cd apps/api
echo -n "$TURNSTILE_SECRET_KEY" | pnpm exec wrangler secret put TURNSTILE_SECRET_KEY
echo -n "$MOS_DATA_KEY" | pnpm exec wrangler secret put MOS_DATA_KEY
```

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
`supabase db push` skip migrations that already ran.
