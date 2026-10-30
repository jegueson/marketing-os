# Architecture Decision Records

Decisions for Marketing OS. Format follows Michael Nygard's lightweight ADR. Status `accepted` means the implementation plan is committed to it. Change a decision by writing a new ADR that supersedes the old one.

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-cloudflare-and-supabase.md) | Host on Cloudflare and Supabase | accepted |
| [0002](0002-typescript-only.md) | TypeScript only | accepted |
| [0003](0003-one-nextjs-app.md) | One Next.js app on Workers | accepted |
| [0004](0004-api-is-the-only-data-path.md) | The API Worker is the only data path | accepted |
| [0005](0005-tenant-isolation.md) | Three-layer tenant isolation | accepted |
| [0006](0006-drizzle-sql-migrations.md) | Drizzle SQL migrations are the schema source | accepted |
| [0007](0007-outbox-and-queues.md) | Transactional outbox relayed to Queues | accepted |
| [0008](0008-envelope-encryption.md) | Envelope-encrypt connector and model secrets | accepted |
| [0009](0009-oauth-on-the-api-worker.md) | OAuth callbacks terminate on the API Worker | accepted |
| [0010](0010-metric-semantic-layer.md) | Versioned, source-namespaced metrics | accepted |
| [0011](0011-ask-marketing-query-plans.md) | Ask Marketing uses typed query plans | accepted |
| [0012](0012-cloudflare-workflows.md) | Cloudflare Workflows behind a port | accepted |
| [0013](0013-sql-conventions.md) | SQL type conventions | accepted |
| [0014](0014-customer-config-yaml.md) | Customer config is versioned data | accepted |
| [0015](0015-default-autonomy-observe.md) | Default autonomy is observe | accepted |
| [0016](0016-agpl-open-core.md) | AGPL-3.0 open core | accepted |
| [0017](0017-openrouter-first-gateway.md) | OpenRouter-first model gateway | accepted |
| [0018](0018-deployment-modes.md) | Two deployment modes and two self-host targets | accepted |

Template for new records: [template.md](template.md).
