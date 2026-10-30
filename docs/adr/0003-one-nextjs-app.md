# ADR-0003: One Next.js app on Workers

**Date**: 2026-10-28
**Status**: accepted
**Deciders**: architecture review

## Context

The product has a customer portal and an internal specialist console. They share auth, tenancy and UI primitives. A solo maintainer and open-source contributors pay a tax for every extra app.

## Decision

One Next.js application, deployed to Cloudflare Workers with the OpenNext adapter. Route groups `(public)`, `(portal)` and `(console)`. Console routes are rejected unless the principal is staff. The web Worker calls the API Worker through a service binding.

## Alternatives Considered

### Alternative 1: Two Next.js apps

- **Pros**: A hard deploy boundary between customers and staff.
- **Cons**: Two builds, two configs, duplicated auth.
- **Why not**: Staff checks in middleware are enough for the pilot. Split later if a customer requires it.

### Alternative 2: A separate SPA without Next.js

- **Pros**: Smaller Worker.
- **Cons**: Loses the App Router and server-side session handling the portal needs.
- **Why not**: Next.js is the UI framework for this repo.

## Consequences

### Positive

- One Vercel-free frontend deploy. Shared primitives.

### Negative

- A bug in the web Worker affects both audiences. Console routes need tests that prove the staff gate.

### Risks

- OpenNext does not cover every Next.js feature. Stay on the documented subset (App Router, route handlers, middleware).
