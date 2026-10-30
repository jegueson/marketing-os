# ADR-0012: Cloudflare Workflows behind a port

**Date**: 2026-10-28
**Status**: accepted
**Deciders**: architecture review

## Context

Workflows must be durable, resumable and retryable. Temporal is the usual engine for that. Temporal is another cluster to run. A self-hoster on their laptop will not operate it. Cloudflare Workflows already provide durable steps on the platform we deploy to.

## Decision

Automations call a `WorkflowPort` in `packages/workflow`. The only adapter in this repository is Cloudflare Workflows. Sprint 1 does not implement the port beyond the interface sketch. Sprint 4 implements it. Local development uses Miniflare's workflow simulation, and the self-host journey tests that path.

## Alternatives Considered

### Alternative 1: Temporal Cloud

- **Pros**: Mature durability model.
- **Cons**: Extra vendor, extra cost, poor fit for "run it on my machine".
- **Why not**: Revisit only if Workflows cannot express a pilot automation.

### Alternative 2: DBOS on Postgres

- **Pros**: Durable and portable.
- **Cons**: Another runtime to learn. Session-mode connections fight Hyperdrive's pooler.
- **Why not**: Kept as a note if the Workflows spike fails in Sprint 4.

## Consequences

### Positive

- No extra cluster. Steps survive isolate eviction.

### Negative

- Workflow code uses Cloudflare's step API inside the adapter. Domain code sees only the port.

### Risks

- Miniflare and production differ. The Sprint 5 Linear write is tested against the real Workflows binding on staging.
