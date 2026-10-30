# ADR-0016: AGPL-3.0 open core

**Date**: 2026-10-28
**Status**: accepted
**Deciders**: product owner

## Context

The owner wants the product on GitHub so customers can self-host, and still wants to sell specialist work and a managed cloud. A permissive licence would let a competitor host the product without publishing their changes. A non-OSI licence would block the "open source" claim.

## Decision

This repository is AGPL-3.0-only. Contributors agree to a contributor licence agreement so the owner can sell a commercial licence and run a private cloud package. The private package contains billing, credit purchase and cloud provisioning. It is not in this repo. It talks to this repo through `BillingProvider` and `ProvisioningHooks`. Anything required to run the product stays here, including a no-op billing implementation and budget caps.

The name and logo are trademarks. A fork may run the code. It may not call itself Marketing OS. See `TRADEMARKS.md`.

## Alternatives Considered

### Alternative 1: Apache-2.0

- **Pros**: Easier enterprise adoption. More contributors.
- **Cons**: A hosted competitor can keep modifications private.
- **Why not**: The owner wants the hosted offer protected by the licence.

### Alternative 2: Business Source Licence

- **Pros**: Blocks competing hosts for a period.
- **Cons**: Not Open Source Initiative open source. The owner asked for open source.
- **Why not**: AGPL is both OSI-approved and network-protective.

## Consequences

### Positive

- Self-hosting is a real offer. Network use of a modified version must ship source.

### Negative

- Some companies will refuse AGPL. The commercial licence exists for them.
- CLA friction reduces drive-by patches. That is accepted.

### Risks

- Proprietary code lands in this repo by habit. Reviewers reject it. `COMMERCIAL.md` lists the boundary.
