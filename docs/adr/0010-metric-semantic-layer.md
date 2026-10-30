# ADR-0010: Versioned, source-namespaced metrics

**Date**: 2026-10-28
**Status**: accepted
**Deciders**: product requirements, architecture review

## Context

GA4 key events, Google Ads conversions and HubSpot deals are not the same number. The product forbids silently merging metrics that have different definitions. Customers also need formulas such as qualified-lead CAC that are not the platform default.

## Decision

A `metric_definition` is versioned and namespaced by source (`google_ads.conversions`, `ga4.key_events`). A customer KPI is a formula over those definitions, stored in configuration (`metrics.yaml` imported into the database), not in TypeScript. `metric_value` rows store a numeric value, the definition version, the period, a hash of dimensions, the source connection and the time the value was fetched. The cockpit refuses to render a number that has no definition version.

## Alternatives Considered

### Alternative 1: One canonical conversions column

- **Pros**: Simple charts.
- **Cons**: Hides disagreements between sources. Breaks trust with a CMO.
- **Why not**: Different definitions must stay distinct, with lineage on every number.

## Consequences

### Positive

- Ask Marketing can cite the definition it used.

### Negative

- The first cockpit looks emptier until definitions exist. That is preferable to a wrong total.

### Risks

- Formula language grows into a product. Sprint 2 supports a small expression set (sum, ratio, filter) and stops there.
