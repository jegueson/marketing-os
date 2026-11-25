# Sprint 4 security review

Date: 2026-11-24. Scope: local stack only. No release tag.

## Exit journey

`e2e/tests/sprint4.api.test.ts` on PGlite with every migration and a stub model (`FakeGateway`). No live provider call.

| Check | Result |
| --- | --- |
| Flag `specialist_config` off | Config import and test-run routes return 404 |
| Import weekly skill + workflow YAML | 200. Published version `1` for each |
| Publish business profile from the example | 200 |
| Mock sync then test-run | 200. Report body contains `mock.spend` and `2550` |
| GET test-run | Same report contains `2550` |
| Other tenant GET run or POST import | 403 |
| `workflow_runs` row | Steps and report JSON do not contain skill instructions |
| Audit `config.workflow_test_run` | Payload does not contain skill instructions |
| `usage_ledger` for the tenant | No skill instructions and no model API key |

`e2e/tests/sprint3.api.test.ts` and earlier journeys are unchanged.

## Controls carried from unit tests

| Control | Where |
| --- | --- |
| Test-run omits instructions; other tenant 403; flag off 404 | `apps/api/src/routes/workflow-runs.test.ts` |
| Config import flag / publish / cross-tenant / invalid YAML | `apps/api/src/routes/config-import.test.ts` |
| YAML import publishes skill + workflow; action field rejected | `packages/db/src/config-import.test.ts` |
| Usage ledger has no prompt or response columns | `packages/db/src/usage-ledger.test.ts` |
| Forced RLS hides another tenant's workflow runs | `packages/db/src/isolation.test.ts` |
| In-memory vs Miniflare step status parity | `apps/api/src/workflows/config-workflow.parity.test.ts` |
| Setup seeds weekly skill once | `apps/cli/src/setup.test.ts` |

## Accepted for this exit

- The weekly review example reads `last_30_days` so mock sync's 30-day aggregates satisfy `coverRange` (ADR-0024).
- Test-run still executes the interpreter in-process; Cloudflare `ConfigWorkflow` is covered by the Miniflare parity test, not this journey.
- Knowledge retrieval is tenant-scoped; a foreign source id yields no text and writes `knowledge.foreign_source_denied`.
- No staging deploy or live model call in this review.
