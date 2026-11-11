# ADR-0020: Content-Security-Policy with per-request nonces

**Date**: 2026-11-11
**Status**: accepted
**Deciders**: product owner, Sprint 1 security review

## Context

The web app shipped Sprint 1 without a Content-Security-Policy. Next.js injects inline scripts, and the lead form loads Cloudflare Turnstile. A static CSP in `next.config.ts` cannot attach a fresh nonce, so those scripts would be blocked.

## Decision

1. `apps/web/src/middleware.ts` generates a nonce per request and sets `Content-Security-Policy` on the request (so Next can stamp its scripts) and on the response.
2. `script-src` is `'self'`, the nonce, `'strict-dynamic'`, and `https://challenges.cloudflare.com`. Development adds `'unsafe-eval'`.
3. `frame-src` allows only the Turnstile origin. `style-src` allows `'unsafe-inline'` because a style nonce would disable that keyword and break the widget.
4. `connect-src` includes `'self'`, the Turnstile origin, and the origins of `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` (plus the matching `ws`/`wss` origin).
5. `upgrade-insecure-requests` is added only when the page is served over HTTPS.
6. `CSP_REPORT_ONLY=1` switches the response header to `Content-Security-Policy-Report-Only` without changing the policy. The default is enforce.

## Alternatives Considered

### Alternative 1: Static CSP with `'unsafe-inline'` for scripts

- **Pros**: No middleware.
- **Cons**: Inline script injection stays allowed. Misses the Sprint 1 review item.
- **Why not**: The review asked for nonces.

### Alternative 2: Report-only as the permanent mode

- **Pros**: Cannot break rendering.
- **Cons**: Does not block anything.
- **Why not**: Report-only remains an escape hatch via `CSP_REPORT_ONLY=1`, not the default.

## Consequences

### Positive

- Each document response carries a unique script nonce. Turnstile is explicitly allowlisted.

### Negative

- New browser calls (another API host, analytics) must be added to `connect-src` or they fail closed.

### Risks

- OpenNext must run this middleware. If a host strips it, the CSP header disappears and the nonce is absent.
