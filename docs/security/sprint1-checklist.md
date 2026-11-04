# Sprint 1 security checklist

- [x] CORS restricted to `APP_ORIGIN`
- [x] Response envelope never returns stack traces
- [x] Public lead endpoint validates Zod schema + honeypot
- [x] Staff routes require principal + permission
- [x] Cross-tenant connection listing returns empty for foreign tenants
- [x] RLS SQL enables FORCE RLS and revokes `anon`/`authenticated`
- [x] Audit immutability trigger present
- [x] Secrets only via env / wrangler secret (no hardcoded keys)
- [x] Gitleaks in CI
- [x] CodeQL workflow present
- [ ] Turnstile verification wired to production site key (staging)
- [ ] Workers Rate Limiting binding attached on staging
- [ ] Supabase JWKS verification enabled on staging

Update this file when staging bindings land.
