# Sprint 3 security review

Date: 2026-11-20. Scope: local stack only. Staging smoke is S3-T37 and is not an exit blocker.

## Exit journey

`e2e/tests/sprint3.api.test.ts` on PGlite with every migration and a stub model (`FakeGateway`). No live provider call.

| Check | Result |
| --- | --- |
| Save model settings | 200. Response does not contain the API key |
| Mock sync after an explicit scope | 202, 3 backfill runs consumed |
| Ask over synced `mock.spend` | 201. Observation `mock.spend: 2550`, definition version `1` |
| History reload | User message is the question. Assistant message contains `2550` |
| Audit `ask.message_created` | Payload has `questionHash`. Payload does not contain the question text |
| Hard budget cap `0` | 402 `budget_exceeded` before another model call |
| Other tenant lists Ask, reads the thread, or posts a message | 403 |

`e2e/tests/journey.api.test.ts` and `e2e/tests/sprint2.api.test.ts` are unchanged.

## Browser

`e2e/tests/sprint1.spec.ts` now asserts, on the cockpit page, that the Ask link is absent and the Models link is visible. Ask stays hidden because `ask_marketing` is off by default. This runs with the local Supabase, API, and web servers. It does not ask a question. The evidenced answer above is the API journey, because the browser stack cannot inject the stub model.

## Controls carried from unit tests

| Control | Where |
| --- | --- |
| Tenant B sentinel absent from A's prompt, response, ledger, audit, and logs | `apps/api/src/routes/ask-tenant-isolation.test.ts` |
| No model key is 422 and does not call the provider | `apps/api/src/routes/ask-messages.test.ts` |
| Ask rate limit is 429 before the provider | `apps/api/src/routes/ask-messages.test.ts` |
| Question hash, not question text, in the audit row | `apps/api/src/routes/ask-messages.test.ts` |
| Usage ledger has no prompt or response columns | `packages/db/src/usage-ledger.test.ts` |
| Prompt lock rejects a text change without a version bump | `packages/prompts/src/lock.test.ts` |
| Replay of 31 golden questions | `evals/ask/src/harness.test.ts` |
| Hard budget blocks before the provider | `packages/model-gateway/src/billing.test.ts` |
| Forced RLS, including Ask tables | `packages/db/src/migrations.test.ts` |
| Staff cannot read another user's conversation | `packages/db/src/ask-conversations.test.ts` |

## Accepted for this exit

- Ask does not call a live model provider. The exit uses `FakeGateway`.
- The model does not receive metric digits. The server writes the visible number from the tool result.
- Cockpit recommendations stay an empty list. Recommendations are Sprint 5.
- Campaign, channel, and creative questions are refused before a model call.
- Live golden-question pass rate is reported on the nightly workflow and does not gate this exit.
- Staging limiter, migrations, and a smoke question stay on S3-T37.
