# Sprint 5 security review

Date: 2026-11-25. Scope: local stack only. Release tag instructions: [../releases/v0.2.0.md](../releases/v0.2.0.md).

## Exit journey

`e2e/tests/sprint5.api.test.ts` on PGlite with every migration. Fake Linear client. No live Linear call. The same journey runs for `MOS_DEPLOYMENT_MODE=self_hosted` and `cloud`.

| Check | Result |
| --- | --- |
| Flag `specialist_config` off | Policy import returns 404 |
| Flag `managed_work` off | Approvals and recommendations lists return 404. Cockpit recommendations stay `[]` |
| Publish example Linear policy | 200. Kind `policy`, name `linear-create-issue`, version `1` |
| Create fixture recommendation | List returns problem `Spend rose without a lead change.` |
| Reserve Linear `create_issue` | Status `awaiting_approval`. Fake client has zero calls |
| Other tenant list approvals or recommendations | 404 `Not found` |
| Approve pending decision | 200. Status `approved`. Fake client still has zero calls |
| Execute approved action | Fake client has one call. External id `lin-1`. Outcome row stores that id |
| Replay same idempotency key | Returns `lin-1`. Fake client still has one call |
| Audit `action.executed`, `approval.decided`, `config.policy_imported` | JSON has no `linear-sandbox-token` and no `prompt` key |
| Flag `managed_work` off again | Approvals and recommendations return 404. Cockpit recommendations stay `[]` |

`e2e/tests/sprint4.api.test.ts` and earlier journeys are unchanged.

## Acceptance criteria

| Id | Result | Evidence |
| --- | --- | --- |
| AC-001 | Pass | `packages/db/src/action-intents.test.ts` — denied autonomy writes no intent |
| AC-002 | Pass | Journey reserve leaves status `awaiting_approval` with zero Linear calls; `apps/api/src/actions/execute-approved.test.ts` |
| AC-003 | Pass | `apps/api/src/actions/execute-approved.test.ts` — expired and late approved perform zero calls |
| AC-004 | Pass | Journey replay keeps one call; `apps/api/src/actions/action-outcomes.test.ts` |
| AC-005 | Pass | Journey other tenant 404 on approvals and recommendations; cockpit cross-tenant stays 403 in unit tests |
| AC-006 | Pass | Journey flag off 404 and empty cockpit recommendations |
| AC-007 | Pass | Journey audit JSON has no token and no prompt body |
| AC-008 | Pass | Journey passes for both `self_hosted` and `cloud` harness modes |

## Controls carried from unit tests

| Control | Where |
| --- | --- |
| Policy YAML publish, `requireApproval: false` writes nothing, skill `action` rejected | `packages/db/src/config-import.test.ts`, `apps/api/src/routes/config-import.test.ts` |
| Pilot workflow stops before approval; after approval outcome is `lin-1` | `apps/api/src/actions/pilot-workflow.test.ts` |
| Threshold example writes one recommendation and no connector call | `packages/workflow/src/fixtures/spend-threshold.example.test.ts` |
| Approvals flag / cross-tenant 404 / decide | `apps/api/src/routes/approvals.test.ts` |
| Recommendations flag / cross-tenant 404 / cockpit empty | `apps/api/src/routes/recommendations.test.ts` |
| Execute only when approved and unexpired; audit has no token | `apps/api/src/actions/execute-approved.test.ts` |
| One outcome per success; failed call stores none | `apps/api/src/actions/action-outcomes.test.ts` |
| Portal approval screen flag gate and decide POST | `apps/web/src/components/approvals-screen.test.tsx` |
| Console audit strips prompt keys | `apps/api/src/routes/audit-log.test.ts` |
| Linear host is fixed; blank idempotency key fails before fetch | `connectors/linear/src/linear.test.ts` |

## Accepted for this exit

- Reserve and execute are not HTTP routes yet. The journey publishes and decides over HTTP, then calls `reserveAction` and `executeApprovedAction` on the same PGlite database.
- The worker `scheduled` handler still does not call `tickSchedule`. Published schedule workflows do not fire in production.
- Linear OAuth token exchange is not wired. Tests inject a sandbox token into `executeApprovedAction` only.
- No staging deploy or live Linear call in this review.
- Tag `v0.2.0` stays on S5-T18 after this review is recorded.
