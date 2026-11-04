# Self-hosting Marketing OS

Two supported paths:

1. **Own Cloudflare account + Supabase** — `pnpm mos deploy` (after configuring Hyperdrive, Queues, R2, secrets).
2. **Local machine** — Supabase CLI or Docker Compose for Postgres, then `wrangler dev` for the API and `next dev` / OpenNext preview for the web app.

## Local quickstart

```bash
pnpm install
pnpm mos setup --mode=self_hosted --email=you@example.com --tenant="My Team" --slug=my-team --model-key=$OPENROUTER_API_KEY
docker compose -f deploy/docker-compose.yml up -d
# apply migrations from packages/db
pnpm --filter @marketing-os/api dev
pnpm --filter @marketing-os/web dev
```

Open http://127.0.0.1:3000.

## Deployment mode

`MOS_DEPLOYMENT_MODE=self_hosted` hides cloud lead-intake and billing UI unless feature flags enable them.
`MOS_DEPLOYMENT_MODE=cloud` enables the Success Manager lead → provision journey.

## Limits (local)

Single machine, no HA. You own backups. Miniflare approximates Queues/R2/Cron; run the Playwright self-host journey in CI for confidence.
