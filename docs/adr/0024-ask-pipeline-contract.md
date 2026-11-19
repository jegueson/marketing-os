# ADR-0024: Ask Marketing pipeline contract

**Date**: 2026-11-13
**Status**: accepted
**Deciders**: product owner, architecture review
**Extends**: [ADR-0011](0011-ask-marketing-query-plans.md)

## Context

Ask Marketing must answer questions from tenant metric data without inventing numbers or leaking across tenants. ADR-0011 already forbids free-form SQL from the model. Sprint 3 needs a concrete contract for plans, tools, evidence, answers and stream events, and two process decisions that ADR-0011 left open: how intent is classified, and how numbers reach the user.

Stored `metric_values` are account-level window aggregates (dimension hash is scope resource ids). Campaign and channel breakouts are not available in Sprint 3.

## Decision

1. **Typed query plan only.** The model emits a `QueryPlan` with at most six steps. Allowed tools: `metric_value`, `metric_compare`, `data_health`, `list_metrics`. Primary ranges are presets (`last_7_days`, `last_30_days`, `this_month`, `last_month`) resolved server-side in UTC; `previous_period` is only valid as `compareTo`. Absolute dates and free-form date math are rejected because the field is an enum, not a string. The plan is `.strict()` and rejects `sql`, `tenantId`, `workspaceId` and `connectionId`. Connections are resolved by the server from the caller's workspace. Metric keys must match `source.name` form.

2. **Intent discriminates the plan.** One model round produces a plan whose `intent` is a discriminated union: `answerable` requires one to six steps with unique ids; refusal intents (`out_of_scope`, `needs_clarification`, `unsupported_dimension`) require an empty step list and a message. A second classification call is not required.

3. **Server-owned numbers.** The answer stage returns prose with `{{ref}}` placeholders. The API renders every number from tool results. Observed facts carry `stepId` so each number traces to a tool result. A bare numeric token that is not produced by a placeholder fails verification; after one repair retry the API falls back to a deterministic template built from evidence.

4. **Evidence holds observed facts only.** `Evidence.observed` holds tool facts with refs and `stepId`. Interpretation prose lives on `Answer`, not on `Evidence`, so the two cannot drift. Freshness is required. The UI shows Observed and Interpretation as separate regions.

5. **Unsupported dimensions refuse.** Questions that need campaign, channel or creative breakouts return `unsupported_dimension` with a suggestion of what can be asked from the catalog.

6. **Stream events.** Clients consume a discriminated `AskStreamEvent` union (`stage`, `plan`, `tool_result`, `evidence`, `delta`, `answer`, `refusal`, `error`, `done`). There is no SQL event type.

Window coverage assumptions (which presets can be answered from sync windows) are verified in S3-T16 and recorded as an amendment note in this ADR when known.

## Alternatives Considered

### Alternative 1: Separate intent classification call

- **Pros**: Clearer prompts.
- **Cons**: Extra latency and cost; two failure modes.
- **Why not**: Intent is small enough to travel with the plan.

### Alternative 2: Model returns formatted numbers

- **Pros**: Simpler UI.
- **Cons**: Hallucinated figures break the trust contract.
- **Why not**: Every displayed number must match a tool result.

## Consequences

### Positive

- Eval can assert arithmetic and citations against fixtures.
- Cross-tenant isolation stays in the MetricReader and RLS, not in prompt discipline alone.

### Negative

- Questions outside the metric catalog or needing dimensions we do not store get a refusal, not a guess.

### Risks

- Partial sync windows may force coverage warnings. A stored value is one aggregate for its whole window, so Ask counts it only when that window lies inside the preset (see the amendment below).

## Amendment (2026-11-19): sync windows and preset coverage

Verified from `planBackfillWindows` in `packages/core/src/scheduler.ts` and `createSyncRuns` in `apps/api/src/sync/engine.ts`.

- The first sync is a 90-day backfill. It ends at UTC midnight of the current UTC date and is split into contiguous 30-day chunks, oldest first. `end` is exclusive.
- An incremental sync is not a fixed number of days. It is one window from the stored cursor to `now`, and that connection is not queued again until a day after the cursor.
- Each `metric_values` row is one number for its whole window. The engine does not store a daily series.

Ask presets (`last_7_days`, `last_30_days`, `this_month`, `last_month`, `previous_period`) are resolved in UTC and also end at UTC midnight, so the current partial day is excluded. `previous_period` is the equal-length window immediately before the primary range. A stored window counts toward coverage only when it lies entirely inside the preset. Contained windows that miss some UTC days are `partial`. A window that merely overlaps the preset is `no_data`, because its aggregate cannot be sliced. On the backfill grid, `last_30_days` matches the newest 30-day chunk (for example, 2026-03-02 through 2026-04-01 when the sync clock is 2026-04-01). `last_7_days` and calendar months do not match those chunks in general. A range that extends past UTC midnight of today is rejected.
