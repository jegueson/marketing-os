# Sprint 1 security checklist

Reviewed 2026-11-05 against the local stack and staging
(`marketing-os-api` / `marketing-os-web` Workers, Supabase `ilgxtbjjawnkvybvcsqm`).
Evidence for each item is in [s1-review.md](s1-review.md).

## Done

- [x] CORS allows only `APP_ORIGIN`; a foreign origin gets no `Access-Control-Allow-Origin` (checked on staging)
- [x] API security headers through `hono/secure-headers` (HSTS, nosniff, frame options, referrer policy)
- [x] Web security headers through `next.config.ts` (`X-Frame-Options: DENY`, nosniff, HSTS, referrer and permissions policy)
- [x] Response envelope never returns stack traces; 5xx errors are logged server-side with request id
- [x] Public lead endpoint validates the Zod schema and the honeypot field
- [x] Public lead endpoint rate-limited by the Workers `ratelimits` binding (5 per 60 s, attached on staging)
- [x] Turnstile fails closed in cloud mode: no secret means 503, never a silent pass
- [x] Staff routes require a principal and a permission; console routes require a staff assignment to the tenant
- [x] Cross-tenant reads return 403 (API e2e and browser journey)
- [x] Every public table has forced RLS; `anon`/`authenticated` hold no table privileges; `app_api` cannot bypass RLS (CI job on real Postgres, and checked on staging)
- [x] The API runs every transaction as `app_api` via `SET LOCAL ROLE`; login roles `postgres` and `mos_hyperdrive` are members (migration 0007, checked on staging)
- [x] Audit events and Success Manager notes are append-only (triggers)
- [x] Supabase JWT verified against JWKS on staging (ES256); a forged token gets 401
- [x] Invitation tokens are stored as SHA-256 hashes, expire after 7 days, and are never returned by the API
- [x] `mos setup` reads secrets from env only and stores the model key AES-GCM encrypted; it never prints the key
- [x] Secrets only via env, `.dev.vars` or `wrangler secret` (no hardcoded keys; tree scanned)
- [x] Gitleaks and CodeQL in CI

## Open

- [ ] Turnstile widget and `TURNSTILE_SECRET_KEY` on staging. Until then the public lead form returns 503 on staging.
- [ ] Content-Security-Policy on the web app (needs per-request nonces for Next.js inline scripts and Turnstile). Planned for Sprint 2.
- [ ] `send_email` binding on staging (needs an onboarded sender domain). Until then invitation email reports `emailDelivery: "failed"` and the console can resend.
