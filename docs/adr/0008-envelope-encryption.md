# ADR-0008: Envelope-encrypt connector and model secrets

**Date**: 2026-10-28
**Status**: accepted
**Deciders**: architecture review

## Context

OAuth refresh tokens and model API keys are tenant secrets. They cannot live in plaintext columns, in logs, or in a vault that only the company's Cloudflare account can open, because self-hosters run the same code.

## Decision

Encrypt secrets in the application with AES-GCM via WebCrypto before insert. Store ciphertext, nonce and a key version. The master key is a Workers secret (`MOS_DATA_KEY`). Rotation writes new rows with the next version and re-encrypts lazily. Logs and error envelopes pass through a redactor that strips tokens and emails.

## Alternatives Considered

### Alternative 1: Supabase Vault

- **Pros**: Keys stay in the database product.
- **Cons**: Vault access patterns differ between hosted Supabase and self-hosted Postgres. The API role would need extra privileges.
- **Why not**: Envelope encryption is the same on every Postgres.

### Alternative 2: Cloudflare Secrets Store per tenant secret

- **Pros**: Platform-managed.
- **Cons**: Secret count and API shape are a poor fit for thousands of tenant tokens, and a local install has no account-level store.
- **Why not**: Self-host must work offline from the company's account.

## Consequences

### Positive

- One code path for local, customer Cloudflare and the managed cloud.

### Negative

- Losing `MOS_DATA_KEY` makes stored tokens unreadable. Document backup of that secret in the self-host guide.

### Risks

- A key in the repository. Gitleaks in CI. `.dev.vars` is gitignored.
