# ADR-0023: Creative generation tools are connectors

**Date**: 2026-11-13
**Status**: accepted
**Deciders**: product owner

## Context

PRD §26 (Brand Studio) already treats ComfyUI as a tool/workflow connector rather than a hard-coded module. Creative teams also use hosted AI tools such as Runway and Higgsfield. Hard-wiring one vendor would fight the connector model used for ads, CRM and analytics, and would force Marketing OS to hold generation keys it should not need on self-host installs.

## Decision

1. Define a **creative-tool port** in the connector SDK (same packaging pattern as data connectors: metadata, auth, tool specs, errors).
2. Planned first adapters: ComfyUI (self-hosted workflow), Runway, Higgsfield. Others implement the same port.
3. Customers bring their own API keys (self-host). Cloud may offer metered access behind the private billing package; the public product still speaks only the port.
4. Generated assets and exports are stored in tenant-scoped R2 with metadata (brief, prompt, tool, workflow or model version, brand-check result, approval id, downstream campaign ids).
5. Publishing to ad or content platforms goes through existing write connectors and the Approvals / policy path (default autonomy observe, ADR-0015).

Product detail: [Planning/prd_v4_addendum.md](../../Planning/prd_v4_addendum.md) section C.

## Alternatives Considered

### Alternative 1: Hard-code one generation vendor in the Brand Studio module

- **Pros**: Faster first demo of generation.
- **Cons**: Lock-in; poor fit for self-host BYOK; duplicates connector auth and secret handling.
- **Why not**: Conflicts with the connector framework and open-core posture.

### Alternative 2: Only support ComfyUI

- **Pros**: Aligns with the original §26 sketch; self-host friendly.
- **Cons**: Excludes teams standardised on Runway, Higgsfield and peers.
- **Why not**: ComfyUI remains a first adapter, not the only one.

## Consequences

### Positive

- One secret and auth path for creative tools and data sources.
- Creative studio can ship UI against fixtures before real adapters exist.

### Negative

- Port design must cover async jobs (queue, poll, webhook) common to video tools.
- Brand and quality checks need a shared interface across tools with different output types.

### Risks

- Vendor APIs change quickly. Mitigate with adapter isolation, contract tests and no business logic importing vendor SDKs outside the adapter.
