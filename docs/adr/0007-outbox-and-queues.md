# ADR-0007: Transactional outbox relayed to Queues

**Date**: 2026-10-28
**Status**: accepted
**Deciders**: architecture review

## Context

Provisioning a customer must create the tenant and emit `customer.provisioned` together. If the event is published before the commit, a consumer can observe a tenant that does not exist. Redis and a Python worker were the previous design. Redis is no longer in the stack.

## Decision

Domain code inserts an outbox row in the same database transaction as the change. A Cron Trigger relays pending rows to a Cloudflare Queue. Consumers are idempotent. Failed messages go to a dead-letter queue. Tenant events must carry `tenant_id`. Platform events before a tenant exists (`lead.created`) are an explicit allowlist.

## Alternatives Considered

### Alternative 1: Publish to the Queue inside the request, after the commit

- **Pros**: Fewer tables.
- **Cons**: A crash between commit and publish drops the event.
- **Why not**: Provisioning and invites cannot lose events.

### Alternative 2: Cloudflare Queues as the only bus, no table

- **Pros**: One system.
- **Cons**: The queue is not transactional with Postgres.
- **Why not**: Same failure mode as alternative 1.

## Consequences

### Positive

- Events survive a crashed isolate. Consumers can be retried.

### Negative

- Delivery is at least once. Every handler checks a processed-event id.

### Risks

- The relay cron is a single point of lag. Alert if the oldest pending row is older than a few minutes.
