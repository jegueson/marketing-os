# ADR-0021: Sync jobs use their own queue

**Date**: 2026-11-11
**Status**: accepted
**Deciders**: product owner

## Context

Connector sync is high volume and retryable. The outbox queue carries domain events such as `customer.provisioned`. Mixing sync pages into that queue would delay those events and make dead-letter handling ambiguous.

## Decision

`mos-sync` is a separate Cloudflare Queue with its own dead-letter queue, `mos-sync-dlq`. A cron lists due connections through `planSyncJobs` and inserts one `sync_runs` row per window. The first sync backfills 90 days in 30-day chunks. Later syncs continue from `sync_cursors`. The consumer sets `app.tenant_id` and ignores a message whose connection is not in that tenant. Metric upserts use the value unique key, so a redelivered message does not double-count. A `rate_limited` provider error retries with exponential backoff.

## Alternatives Considered

### Alternative 1: Reuse the outbox queue

- **Pros**: One consumer.
- **Cons**: A backfill can starve provisioning events.
- **Why not**: The queues fail and scale independently.

## Consequences

### Positive

- A connection with scopes can sync on the mock connector without blocking the outbox.

### Negative

- Operators create `mos-sync` and `mos-sync-dlq` beside the outbox queues.

### Risks

- The cron role must be allowed to list due connections. That list is a security-definer function and it refuses callers that are not in staff context.
