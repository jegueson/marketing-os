# ADR-0002: TypeScript only

**Date**: 2026-10-28
**Status**: accepted
**Deciders**: product owner, architecture review

## Context

An earlier design used Python 3.12 and FastAPI. Cloudflare Python Workers run Pyodide and only load pure-Python packages. The drivers this system needs for Postgres (asyncpg, psycopg) are native extensions, so the FastAPI design cannot run on Workers as written.

## Decision

The repository is TypeScript. The API is Hono with Zod. The database layer is Drizzle. Schemas in Zod are shared by the API and the UI.

## Alternatives Considered

### Alternative 1: FastAPI in Cloudflare Containers

- **Pros**: Keeps the earlier Python stack.
- **Cons**: Two languages, container cold starts, a harder self-host story, fewer contributors.
- **Why not**: The owner chose the Workers-native TypeScript path.

### Alternative 2: Python Workers and JavaScript drivers via FFI

- **Pros**: Stays on Workers without containers.
- **Cons**: Immature package story. Business code would cross a language boundary on every query.
- **Why not**: More moving parts than a single TypeScript codebase.

## Consequences

### Positive

- One language for contributors. Generated types are unnecessary across a language boundary; Zod is the contract.
- First-class Workers bindings.

### Negative

- Older notes that mention FastAPI are historical. New code follows this ADR.
- CPU-heavy work (large syncs, embeddings of big files) must be split across Queues or Workflows.

### Risks

- A future connector that only has a Python SDK needs an HTTP implementation or a small sidecar. Prefer HTTP.
