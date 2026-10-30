# ADR-0005: Three-layer tenant isolation

**Date**: 2026-10-28
**Status**: accepted
**Deciders**: architecture review, database review

## Context

A marketing operating system stores another company's spend, leads and brand rules. One missed `where` clause is a reportable incident. Users may belong to several tenants. Staff may be assigned to some tenants and not others.

## Decision

1. The tenant or workspace id is in the API path. The handler loads the principal's memberships and rejects a mismatch.
2. The request's queries run in a transaction that calls `set_config('app.tenant_id', ..., true)` and the same for `app.user_id`. The third argument keeps the setting transaction-local, which is required because Hyperdrive pools connections.
3. Every tenant-owned table has row-level security using `app.current_tenant_id()`. The API role cannot bypass RLS. A CI test fails if a tenant table has no policy.

Queue consumers and Workflows receive `tenant_id` in the payload, check that the target resource belongs to it, and set the same config. Leads exist before any tenant and are readable only by staff (ADR detail in the schema doc).

## Alternatives Considered

### Alternative 1: Application filters only

- **Pros**: Simpler SQL.
- **Cons**: One unscoped query leaks data. Workers using a privileged role make this likely.
- **Why not**: Defence in depth is cheap compared to the incident.

### Alternative 2: Schema-per-tenant

- **Pros**: Strong physical isolation.
- **Cons**: Migrations and connection pooling become per-tenant. Too heavy for a solo pilot.
- **Why not**: Revisit only if a contract requires it.

## Consequences

### Positive

- Isolation is testable at the database and at the API.

### Negative

- Every migration that adds a table must add a policy. The CI check exists so this is not optional.

### Risks

- A session-level `set_config` would leak the previous tenant on a pooled connection. Code review rejects `set_config` calls whose third argument is not `true`.
