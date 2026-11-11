# Marketing OS

The open-source operating system for a marketing team. Connect the stack you already use. See it in one cockpit. Ask questions about your own data. Automate the recurring work, with a human approval when the action is risky.

The software is free to run. You bring a model key. Specialist help and managed hosting are separate paid offers. See [COMMERCIAL.md](COMMERCIAL.md).

**Status: pre-alpha (Sprint 1).** Lead intake, provisioning, invitations, the mock connector, the cockpit shell and the specialist console work end to end on the local stack, with `mos setup` for a single-tenant install. Real data connectors arrive in Sprint 2. See [docs/self-hosting.md](docs/self-hosting.md).

## What you get

- A marketing cockpit across performance, organic, leads, retention and data health.
- Ask Marketing: questions answered from your data, with sources and freshness.
- A specialist console for skills, agents, prompts, workflows and automations.
- Governed actions. The default is to observe. Writes require a policy and, when the policy says so, an approval.
- Your model: OpenRouter by default, or any OpenAI-compatible endpoint, OpenAI, or Anthropic.

## Who it is for

Marketing teams that already have several tools, a CRM and a reporting burden. The product is marketing-only. It is not a sales CRM, a support chatbot, or a general agent platform.

## Run it yourself

Two targets. See [docs/self-hosting.md](docs/self-hosting.md).

**On your machine** (single team, you own backups):

```bash
pnpm install
pnpm mos setup --mode=self_hosted --email=you@example.com --tenant="My Team" --slug=my-team --model-key=$OPENROUTER_API_KEY
docker compose -f deploy/docker-compose.yml up -d   # optional local Postgres + Mailpit
pnpm test
pnpm dev
```

**On your Cloudflare account** plus a Supabase project:

```bash
pnpm mos deploy
```

Self-hosters create the first admin in the setup wizard. There is no public signup.

## Hosted cloud and specialist help

| Offer | What you pay for |
| --- | --- |
| Community | Nothing. You host it and bring a model key. Support is GitHub. |
| Expert services | A specialist designs and improves skills and workflows on your install or on the cloud. |
| Marketing OS Cloud | We host it. You buy AI credits. Optional specialist capacity. |
| Enterprise | Commercial licence, SSO, SLA. |

Details and how to get in touch: [COMMERCIAL.md](COMMERCIAL.md).

There is no self-service checkout. Cloud workspaces are provisioned after a conversation.

## Repository map

| Path | What it is |
| --- | --- |
| [apps/api](apps/api) | Hono API Worker |
| [apps/web](apps/web) | Next.js (OpenNext on Workers) |
| [apps/cli](apps/cli) | `mos` setup / deploy CLI |
| [packages/](packages) | core, db, ui, schemas, connector-sdk, metrics, api-client |
| [connectors/mock](connectors/mock) | Deterministic Sprint 1 connector |
| [docs/adr/](docs/adr/README.md) | Architecture decisions |
| [docs/design/](docs/design/README.md) | Interactive investor demo at `/demo`: design system, screens, demo script |
| [docs/architecture/sprint1-schema.md](docs/architecture/sprint1-schema.md) | Database contract for the first schema |
| [docs/security/sprint1-checklist.md](docs/security/sprint1-checklist.md) | Sprint 1 security checklist |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to change the code |

## Stack

TypeScript on Cloudflare Workers (Next.js, Hono, Queues, Cron Triggers, Workflows, R2) and Supabase (Auth, Postgres, pgvector). Decisions: [ADR-0001](docs/adr/0001-cloudflare-and-supabase.md), [ADR-0002](docs/adr/0002-typescript-only.md).

## Licence

[AGPL-3.0](LICENSE). If you run a modified version on a server, you must offer the source to the users who interact with it. The name and logo are trademarks ([TRADEMARKS.md](TRADEMARKS.md)). A commercial licence is available for teams that cannot accept the AGPL ([COMMERCIAL.md](COMMERCIAL.md)).

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md). Bugs and security issues: [SECURITY.md](SECURITY.md). What is free support and what is paid: [SUPPORT.md](SUPPORT.md).
