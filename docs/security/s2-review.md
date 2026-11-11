# Sprint 2 security review

Date: 2026-11-11. Scope: local stack only. Staging deploy (S2-T17) is still open, so this review does not claim a staging smoke.

## Exit journey

`e2e/tests/sprint2.api.test.ts` on PGlite with every migration:

| Check | Result |
| --- | --- |
| Sync with no scopes | 422 `no_scopes_selected` |
| Mock sync after an explicit scope | 3 backfill runs consumed |
| Cockpit widgets | Eight KPIs, each `definitionVersion` is `1` and the value is present |
| Refresh token in cockpit JSON | Absent |
| Other tenant reads the workspace cockpit or triggers sync | 403 |
| Other tenant's own cockpit | No KPI cards |
| OAuth start response | No `code_verifier` |
| Callback after `grant-revoked` | 302, location has no refresh token |
| Refresh of that connection | 409 `access_revoked`, connection `expired` |
| `credential_references.ciphertext` | Does not contain the refresh token |

`e2e/tests/journey.api.test.ts` (Sprint 1 lead → cockpit, and cross-tenant 403) still passes.

## Controls carried from unit tests

| Control | Where |
| --- | --- |
| CSP nonce, Turnstile origin, no token in the policy | `apps/web/src/lib/csp.test.ts` |
| Log redaction of bearer tokens and `refresh_token=` | `packages/core/src/telemetry.test.ts` |
| AES-GCM round trip, previous key version, tampered ciphertext | `packages/core/src/crypto.test.ts` |
| OAuth state replay and expiry | `apps/api/src/routes/oauth.test.ts` |
| Sync consumer ignores another tenant's connection | `apps/api/src/sync/sync.test.ts` |
| KPI omitted when the source has no definition version | `packages/metrics/src/kpi.test.ts` |
| Forced RLS, including new tables | `packages/db/src/migrations.test.ts` |

## Accepted for this exit

- Real GA4, Google Ads, and HubSpot connectors are not required. The exit uses the mock provider.
- Staging still has no Turnstile secret, no `send_email` binding, and no confirmed `mos-sync` queue. Those stay on S2-T17.
- The browser Playwright spec is still the Sprint 1 journey. The Sprint 2 proof above is the API journey, because sync and the OAuth callback belong to the API.
