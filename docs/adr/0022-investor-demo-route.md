# ADR-0022: Investor demo at `/demo` with its own UI stack

**Date**: 2026-11-11
**Status**: accepted
**Deciders**: product owner

## Context

The product needs an interactive mockup for investor meetings before the real screens exist. It should show every main area (cockpit, Ask Marketing, modules, automations, approvals, integrations, specialist console, onboarding) with realistic data, lots of motion, a light/dark toggle, and a guided tour. It must not change the real app or need an account.

## Decision

1. The demo lives in `apps/web` under `/demo` (`src/app/demo`, `src/demo`). It is public, uses no auth guard, and sets `robots: noindex`.
2. It reads only static, deterministic data from `src/demo/data`. It never calls the API, Supabase or a model.
3. Styling uses Tailwind CSS v4. Tokens and utilities are scoped to the `.mos` wrapper in `src/app/demo/demo.css`, which only the demo layout imports.
4. Motion uses `motion` (`motion/react`), charts use `recharts`, icons use `lucide-react`. Fonts load through `next/font/google` so they are self-hosted and fit the CSP (`font-src 'self'`).
5. Motion and Recharts set inline styles, which the existing CSP already allows (`style-src 'unsafe-inline'`, ADR-0020). No CSP change.
6. Browser checks (`e2e/demo/tour-smoke.mjs`, `e2e/demo/screenshots.mjs`) are scripts, not part of CI.

Design details: [docs/design/README.md](../design/README.md).

## Alternatives Considered

### Alternative 1: A separate app (`apps/demo`)

- **Pros**: No new dependencies in the product app.
- **Cons**: A second Next.js deploy and build to maintain.
- **Why not**: The demo should deploy with the product and later share components with it.

### Alternative 2: Static images or a Figma prototype

- **Pros**: No code.
- **Cons**: Little real interaction or motion; drifts from the product.
- **Why not**: The owner asked for an interactive mockup.

### Alternative 3: Build the demo with `packages/ui` only

- **Pros**: No new dependencies.
- **Cons**: `packages/ui` has no charts, motion or theming yet.
- **Why not**: Too much to build for a mockup.

## Consequences

### Positive

- Investors and design reviewers see the whole product in one link, with stable numbers.
- The real routes, auth and data path are unchanged.

### Negative

- `apps/web` gains four runtime dependencies (`motion`, `recharts`, `lucide-react`, and Tailwind at build time). They load only on `/demo` routes.
- Demo components are separate from `packages/ui`, so some visuals exist twice until the product screens adopt them.

### Risks

- Someone may mistake demo numbers for real data. Every page footer says the company and figures are fictional.
- Demo copy can drift from the product. Review `src/demo/data` when the PRD changes.
