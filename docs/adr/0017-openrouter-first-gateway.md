# ADR-0017: OpenRouter-first model gateway

**Date**: 2026-10-28
**Status**: accepted
**Deciders**: product owner

## Context

Self-hosters must bring a model. Asking every installer to create an OpenAI or Anthropic account is a worse default than one OpenAI-compatible key that can route to many models. The managed cloud still needs cost control.

## Decision

The gateway interface is `listModels`, `getCapabilities`, `complete`, `stream`, `embed`, `estimateCost`. Adapters, in order: OpenRouter, generic OpenAI-compatible HTTP, OpenAI, Anthropic. Setup defaults the provider to OpenRouter. Keys are per tenant and encrypted (ADR-0008). Every call writes a usage-ledger row. Budget caps live in this repo. Credit balances and payment live behind `BillingProvider` and are not implemented here.

## Alternatives Considered

### Alternative 1: OpenAI as the only adapter

- **Pros**: One SDK, one bill.
- **Cons**: Locks self-hosters and contradicts the PRD's provider-neutral gateway.
- **Why not**: OpenRouter and compatible endpoints cover local models too.

## Consequences

### Positive

- A laptop with Ollama works. The cloud can still use a platform key.

### Negative

- Quality varies by model. Evals record the model id. Docs name a recommended default model.

### Risks

- A logged prompt contains customer data. The gateway logs ids, token counts and latency, not prompt bodies, unless a tenant turns on debug in a non-production environment.
