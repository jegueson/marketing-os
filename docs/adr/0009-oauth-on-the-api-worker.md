# ADR-0009: OAuth callbacks terminate on the API Worker

**Date**: 2026-10-28
**Status**: accepted
**Deciders**: architecture review

## Context

Google, Meta, HubSpot, Linear and Notion use OAuth. The callback URL is registered per app and is painful to change. The browser talks to the web Worker, which is a different origin from the API in some deploys.

## Decision

Authorization starts with an API route that stores PKCE state server-side and redirects to the provider. The provider redirects back to the API Worker. The API exchanges the code, encrypts the tokens (ADR-0008), then redirects the browser to the portal. The web Worker never sees the refresh token.

## Alternatives Considered

### Alternative 1: Callback on the Next.js app

- **Pros**: One public hostname.
- **Cons**: Token handling moves into the UI deploy. Service-binding-only APIs would still need a public callback.
- **Why not**: Token exchange belongs next to the encryption code.

## Consequences

### Positive

- One redirect URI pattern: `https://<api-host>/api/v1/integrations/oauth/callback`.

### Negative

- Self-hosters must expose the API host to the provider. The docs say so before they create the OAuth app.

### Risks

- State fixation. State rows are single-use, bound to the tenant, and expire within minutes.
