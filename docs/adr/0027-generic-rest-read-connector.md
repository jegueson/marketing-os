# ADR-0027: Generic REST read connector stays HTTPS GET only

**Date**: 2026-11-25
**Status**: accepted
**Deciders**: product requirements, security review

## Context

Sprint 4 needs a way to pull a numeric metric from a customer HTTPS endpoint without shipping a bespoke connector for every SaaS. A naive `fetch(url)` from connector credentials would let a specialist point at `http://127.0.0.1`, link-local cloud metadata, or issue a non-GET write.

Model-gateway already guards LLM base URLs, but that guard allows private HTTP in self-host mode and throws `ModelGatewayError`. Connectors must not depend on the model package for SSRF policy.

## Decision

1. **Ship `@marketing-os/connector-rest`.** Slug `rest`. Auth type `api_key`. Credentials come from the existing keyring map (`base_url`, optional `bearer_token` / `api_key`).
2. **Only HTTPS GET.** `assertSafeRestUrl` refuses non-HTTPS, URL-embedded credentials, loopback, private IPv4/IPv6, link-local, and metadata hostnames before any socket opens. `assertRestGetMethod` refuses every method other than GET. Fetch uses `redirect: "error"`.
3. **Hostname/literal check only.** DNS names that resolve to private IPs are out of scope for this ADR; a later hardening can add resolve-and-recheck.
4. **Contract kit + blocked-address tests gate the package.** A public HTTPS fixture must return a `MetricResult` lineage row.

## Alternatives Considered

### Alternative 1: Reuse `assertSafeModelEndpoint` from model-gateway

- **Pros**: One implementation of private-IP checks.
- **Cons**: Self-host private HTTP escape hatch; wrong error type; couples connectors to the model package.
- **Why not**: REST policy is stricter and package boundaries stay clean.

### Alternative 2: Allow arbitrary methods with an allowlist of hosts

- **Pros**: Could cover POST search APIs.
- **Cons**: Write verbs turn a read connector into an action surface Sprint 4 forbids.
- **Why not**: Observe-only. Writes wait for an action connector with approvals.

## Consequences

### Positive

- Customers can wire a simple HTTPS metric endpoint without a new deploy.
- SSRF and non-GET refusal are unit-tested without opening sockets.

### Negative

- Only JSON objects with a numeric `value` are supported in this version.

### Risks

- DNS rebinding to a private IP after the hostname check. Mitigate later with resolve-and-recheck or an egress proxy.
