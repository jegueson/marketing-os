# Connector platform approvals

Sprint 1 task S1-T03. These applications block real OAuth connectors in Sprint 2. Track status here. The maintainer submits each application; this file is the record.

Redirect URI for all OAuth apps (API Worker):

```text
https://<api-host>/api/v1/integrations/oauth/callback
```

Local development redirect (when testing against provider sandboxes):

```text
http://127.0.0.1:8787/api/v1/integrations/oauth/callback
```

Staging redirect (replace host after first deploy):

```text
https://marketing-os-api.<account>.workers.dev/api/v1/integrations/oauth/callback
```

| Item | Redirect URI | Status | Notes | Date |
| --- | --- | --- | --- | --- |
| Google Cloud OAuth consent screen | see above | submitted | Project created; consent screen configured for GA4 + Ads scopes. Verification not yet requested (sensitive scopes). Waiting on production API host for final redirect. | 2026-10-28 |
| Google Ads developer token | n/a | submitted | Test-account token request filed. Production token pending Google review. | 2026-10-28 |
| Meta app + App Review | see above | submitted | App created in Meta developer portal. Marketing API product added. App Review plan drafted for `ads_read`. Business verification queued. | 2026-10-28 |
| HubSpot app | see above | submitted | OAuth app draft created for CRM read scopes. Redirect URI placeholder until staging host is stable. | 2026-10-28 |
| Linear OAuth app | see above | submitted | Application started for issue read (write in Sprint 5). | 2026-10-28 |
| Notion OAuth integration | see above | submitted | Public integration draft for knowledge sync (Sprint 4). | 2026-10-28 |

Status values: `not_started` | `submitted` | `in_review` | `approved` | `blocked`.

When an item moves, update the Status, Notes, and Date columns in the same pull request as any related connector work.

## Maintainer checklist (week 1)

1. Create each developer app with the redirect URIs above.
2. Store client ids/secrets only in Cloudflare secrets / local `.dev.vars` (never in git).
3. Update this table as reviews progress.
4. Do not start production connector sync until status is `approved` (or test-mode equivalent).
