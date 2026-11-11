# ADR-0019: OpenAPI as the API contract and generated client

**Date**: 2026-11-08
**Status**: accepted
**Deciders**: product owner, architecture review

## Context

Sprint 1 used shared Zod schemas in `@marketing-os/schemas` as the contract between the Hono API and the Next.js app. The web app kept a hand-written fetch wrapper with untyped paths. S1-T18 deferred generating `packages/api-client` from an OpenAPI document. Without a single exported document, CI cannot detect drift and external integrators have no machine-readable surface.

## Decision

1. Every HTTP route on the API Worker is registered with `@hono/zod-openapi` (`OpenAPIHono` + `createRoute`).
2. The OpenAPI 3.1 document is exported from the live route registry into `packages/openapi/openapi.json` via `apps/api/scripts/export-openapi.ts`.
3. `openapi-typescript` generates `packages/api-client/src/generated/schema.ts`. The web app imports only `@marketing-os/api-client` for HTTP access; the thin `apps/web/src/lib/api.ts` re-exports that package.
4. CI runs `pnpm openapi:check`, which regenerates the document and types and fails when `git diff` is non-empty.
5. Shared Zod schemas remain the runtime validation source. OpenAPI metadata is attached via `@asteasolutions/zod-to-openapi` in `@marketing-os/schemas`.

## Alternatives Considered

### Alternative 1: Keep hand-written clients and shared Zod only

- **Pros**: Less tooling.
- **Cons**: Drift between UI types and routes; no public document; S1-T18 unfinished.
- **Why not**: Blocks self-hosters and future SDK consumers.

### Alternative 2: tRPC or oRPC end-to-end types

- **Pros**: Excellent TypeScript ergonomics.
- **Cons**: Leaves the Workers/OpenAPI ecosystem; harder for non-TS clients.
- **Why not**: Stack decision is Hono on Workers with an OpenAPI document.

## Consequences

### Positive

- One document describes the API. CI catches stale clients. Envelope parsing is centralized.

### Negative

- Route changes require regenerating OpenAPI artifacts. Response schemas for Drizzle row shapes stay loose (`JsonValue`) until tightened per endpoint.

### Risks

- Zod transforms (trim, default) can produce awkward OpenAPI schemas. Prefer documenting input shapes carefully and keep runtime validation on the shared Zod schemas.
