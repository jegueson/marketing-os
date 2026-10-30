# Marketing OS

The open-source operating system for a marketing team. Connect the stack you already use. See it in one cockpit. Ask questions about your own data. Automate the recurring work, with a human approval when the action is risky.

The software is free to run. You bring a model key. If you want a marketing specialist to design the skills and workflows for your business, or if you want it hosted for you, that is a paid offer on top of this repo.

**Status: pre-implementation.** The documents in `Planning/` and `docs/` are the contract. The application scaffold starts at task S1-T01 in `tasks.md`.

## What you get

- A marketing cockpit across performance, organic, leads, retention and data health.
- Ask Marketing: questions answered from your data, with sources and freshness.
- A specialist console for skills, agents, prompts, workflows and automations.
- Governed actions. The default is to observe. Writes require a policy and, when the policy says so, an approval.
- Your model: OpenRouter by default, or any OpenAI-compatible endpoint, OpenAI, or Anthropic.

## Who it is for

Marketing teams that already have several tools, a CRM and a reporting burden. The product is marketing-only. It is not a sales CRM, a support chatbot, or a general agent platform.

## Run it yourself

Two targets. Both are specified. The commands below become real in Sprint 1 (`tasks.md`, S1-T38 and S1-T39). Until then, do not expect them to boot an app.

**On your machine** (single team, you own backups):

```bash
pnpm install
pnpm mos setup
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
| [objective.md](objective.md) | Goal, boundaries, success criteria |
| [tasks.md](tasks.md) | The build, one task at a time |
| [Planning/](Planning/) | PRD, business plan, implementation plan |
| [docs/adr/](docs/adr/README.md) | Why the stack looks like this |
| [docs/architecture/sprint1-schema.md](docs/architecture/sprint1-schema.md) | First database contract |

## Stack

TypeScript on Cloudflare Workers (Next.js, Hono, Queues, Cron Triggers, Workflows, R2) and Supabase (Auth, Postgres, pgvector). Decisions: [ADR-0001](docs/adr/0001-cloudflare-and-supabase.md), [ADR-0002](docs/adr/0002-typescript-only.md).

## Licence

[AGPL-3.0](LICENSE). If you run a modified version on a server, you must offer the source to the users who interact with it. The name and logo are trademarks ([TRADEMARKS.md](TRADEMARKS.md)). A commercial licence is available for teams that cannot accept the AGPL ([COMMERCIAL.md](COMMERCIAL.md)).

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md). Bugs and security issues: [SECURITY.md](SECURITY.md). What is free support and what is paid: [SUPPORT.md](SUPPORT.md).
