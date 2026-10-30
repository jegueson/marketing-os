# ADR-0011: Ask Marketing uses typed query plans

**Date**: 2026-10-28
**Status**: accepted
**Deciders**: architecture review

## Context

Ask Marketing answers questions about a tenant's marketing data. Free-form SQL from a model can read another tenant, invent a join, or return a number nobody can trace.

## Decision

The model emits a typed query plan that names metric definitions, a time range and filters. The API executes that plan with read-only tools. The model never receives a database connection. Every number in the answer must match a value returned by a tool. The response includes sources, range, filters, freshness and a split between observed values and interpretation.

## Alternatives Considered

### Alternative 1: Text-to-SQL with the schema in the prompt

- **Pros**: Flexible questions.
- **Cons**: Cross-tenant risk, untraceable numbers, prompt injection via data.
- **Why not**: The product's trust requirement is evidence, not flexibility.

## Consequences

### Positive

- Evaluation can check arithmetic and citations against fixtures.

### Negative

- Questions outside the metric catalog get a clear refusal, not a guess.

### Risks

- Tool results pasted into prompts could still leak if the prompt is logged. Logs store plan ids, not raw rows.
