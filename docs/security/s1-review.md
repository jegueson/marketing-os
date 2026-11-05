# Sprint 1 security review

Date: 2026-11-05. Scope: lead intake, provisioning, invitations, integrations,
cockpit, console, `mos setup`, staging Workers and the Supabase staging project.

## How each control was checked

| Control | Check | Result |
| --- | --- | --- |
| CORS | `OPTIONS /api/v1/me` from `https://evil.example` on staging | No `Access-Control-Allow-Origin` |
| API headers | `curl -I /healthz` on staging | HSTS, nosniff, `X-Frame-Options`, `Referrer-Policy: no-referrer` |
| Web headers | `apps/web/src/lib/web-lib.test.ts` and `curl -I /login` | `X-Frame-Options: DENY`, nosniff, HSTS |
| Input validation | `POST /api/v1/public/leads` with `{}` on staging | 422 with field errors, no stack |
| Rate limit | `PUBLIC_LEADS_RATE_LIMITER` listed in the staging deploy bindings | 5 requests / 60 s |
| Captcha | `/readyz` on staging reports `captcha: missing`; cloud mode returns 503 | Fails closed |
| JWT | Staging JWKS serves an ES256 key; forged HS256 token on `/api/v1/me` | 401 |
| RLS | `supabase/tests/check_rls.sql` in CI and the same queries on staging | No table without forced RLS, no anon grants, `app_api` has no bypass |
| Role switch | `pg_auth_members` on staging | `postgres`, `mos_hyperdrive` are members of `app_api` |
| Tenant isolation | `e2e/tests/journey.api.test.ts`, `apps/api/src/routes/*.test.ts` | Foreign workspace and tenant reads return 403 |
| Secret scan | Regex scan for Supabase secret keys, model keys and private keys in tracked files | None found; local `.dev.vars` and `.env.local` are gitignored |

## Error leakage

`app.onError` returns the envelope with a code and a safe message. `AppError`
subclasses carry their own status. Anything else becomes `internal_error` with
status 500. Details are logged with `formatLogLine` (request id, route), never
sent to the client. `readyz` reports missing configuration as 503 and does not
include connection strings.

## Accepted risks for Sprint 1

- No Content-Security-Policy on the web app yet. All data access goes through
  the API with a Bearer token, and the web app renders no user HTML.
- Supabase session lives in browser storage (supabase-js default). The API
  enforces every permission, so a stolen token is limited to that user's
  access until it expires.
- Staging has no Turnstile secret and no `send_email` binding. Both fail
  closed: lead intake returns 503, and invitation email is reported as failed.
