# ADR-0022: Integrate with external automation platforms; do not embed them

**Date**: 2026-11-13
**Status**: accepted
**Deciders**: product owner

## Context

Marketers already automate work in n8n, Zapier and Make. The investor demo made native workflow canvases look like a full builder. Rebuilding that surface would delay the pilot and compete with tools teams already pay for.

n8n's Sustainable Use Licence does not allow embedding its editor in a commercial product without a paid Embed agreement. That also sits poorly next to AGPL-3.0. Zapier embedding requires its partner programme and a published Zapier app.

ADR-0012 already chose Cloudflare Workflows behind `WorkflowPort` for durable, resumable agent workflows with policy and approval.

## Decision

1. Keep native governed workflows on Cloudflare Workflows (ADR-0012). Use them for agent runs that need policy, approval, audit and outcome tracking.
2. Integrate with the customer's own n8n, Zapier or Make:
   - outbound signed webhooks for product events;
   - inbound scoped actions API; policy-gated actions still go through Approvals.
3. Do not embed the n8n, Zapier or Make editors in Marketing OS.
4. Do not build a customer-facing generic workflow builder before the pilot (and prefer never: use integration instead).
5. After the events and actions API is stable, package an n8n community node and a Zapier app that call the same contracts.

Product detail: [Planning/prd_v4_addendum.md](../../Planning/prd_v4_addendum.md) section E.

## Alternatives Considered

### Alternative 1: Embed n8n via Embed licence

- **Pros**: Familiar visual builder inside Marketing OS.
- **Cons**: Paid Embed agreement, second stack to host and upgrade, AGPL coexistence risk, large security and CSP surface.
- **Why not**: Cost and licence conflict outweigh the UX gain when teams already run n8n.

### Alternative 2: Build a full in-product workflow builder

- **Pros**: One product surface.
- **Cons**: Large build; listed under "do not build before the pilot"; duplicates n8n/Zapier/Make.
- **Why not**: Integration covers the need without the build.

### Alternative 3: Native workflows only

- **Pros**: Simplest architecture.
- **Cons**: Forces every glue automation into Marketing OS; weaker "daily OS" story for ops-heavy teams.
- **Why not**: Rejected for outbound/inbound integration; native path remains for governed agent work.

## Consequences

### Positive

- ADR-0012 stays valid. Teams keep their existing automation tools.
- Approvals and audit remain the single gate for risky actions.

### Negative

- Two automation paths to document (native vs external).
- Webhook delivery and inbound auth must be designed carefully (signing, replay, least privilege).

### Risks

- Event schema drift if nodes and apps are published too early. Mitigate by versioning payloads and delaying packaging until the API is stable.
