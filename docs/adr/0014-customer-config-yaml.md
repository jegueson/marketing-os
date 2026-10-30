# ADR-0014: Customer config is versioned data

**Date**: 2026-10-28
**Status**: accepted
**Deciders**: product requirements

## Context

A specialist must change a prompt, skill or KPI for one customer without a code deploy. Those definitions should also exist as files so they can be reviewed and reused.

## Decision

The database holds the runtime copy as immutable versions. YAML under `customer-configs/` is the import and export format. A loader validates YAML with Zod, shows a diff, and writes a new version. Ordinary configuration never requires an application release. Tenant-specific code, if it is ever required, goes behind an extension point and is justified in the pull request.

## Alternatives Considered

### Alternative 1: YAML files read from disk at runtime

- **Pros**: Git is the source of truth.
- **Cons**: Workers have no tenant filesystem. Deploys would ship one customer's config to everyone.
- **Why not**: The database is the only store available in every deployment mode.

## Consequences

### Positive

- The same format works locally, on a customer's Cloudflare account and in the managed cloud.

### Negative

- Two representations exist. The import command is the only writer. Hand-editing production rows is an incident.

### Risks

- A YAML file checked into a public fork could contain a real customer's brand rules. The repo ships templates and examples only. Real tenant exports stay in a private location.
