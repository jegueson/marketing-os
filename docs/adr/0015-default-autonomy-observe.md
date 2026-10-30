# ADR-0015: Default autonomy is observe

**Date**: 2026-10-28
**Status**: accepted
**Deciders**: product requirements

## Context

The product can eventually change campaigns, CRM records and tasks. The first users will not trust an unattended write. Autonomy levels exist, and the default is observe.

## Decision

Every external write declares a permission, a risk class, an approval requirement and an idempotency key. The default level is `OBSERVE`. `CONTROLLED_AUTONOMY` requires a passing evaluation, an explicit policy, scoped tools and a rollback note. Sprint 1 implements no writes to marketing platforms. The first write, in Sprint 5, is creating a Linear issue after approval.

## Alternatives Considered

### Alternative 1: Ship a write connector in the first pilot week

- **Pros**: A stronger demo.
- **Cons**: An unreviewed action against a customer's ad account.
- **Why not**: Trust is the product. The cockpit and Ask Marketing come first.

## Consequences

### Positive

- Policies and approvals have a real consumer in Sprint 5, not a fictional one.

### Negative

- Early demos recommend work. They do not do the work.

### Risks

- A connector author exposes a write tool without an approval flag. The contract test kit fails actions that omit risk and approval.
