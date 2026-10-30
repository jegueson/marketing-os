# Contributing

Marketing OS is AGPL-3.0. Contributions are welcome. Read `docs/adr/` before changing architecture.

## Ground rules

- One focused change per pull request. Do not expand the scope.
- Tests first. A change without a test for the behaviour it claims is not ready.
- TypeScript strict. No `any` unless a comment says why.
- Do not import a model vendor SDK or a marketing-platform SDK outside its adapter package.
- Do not add payment, credit checkout or cloud-provisioning code. Those belong in the private package. See [COMMERCIAL.md](COMMERCIAL.md).
- Do not commit secrets, customer data or real tenant YAML. `.env`, `.dev.vars` and `customer-configs/<tenant>/` exports stay local.
- Conventional Commits: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.

## Setup

The commands in the README become valid at the end of S1-T01 and S1-T39. Until then:

```bash
pnpm install
pnpm test
pnpm typecheck
```

## Pull requests

- Fill in the pull request template.
- Keep the diff limited to the task.
- Run `pnpm test` and `pnpm typecheck`.
- If you touch auth, tenancy, SQL or a public route, say so. A reviewer will look at isolation and secrets.
- New tables with `tenant_id` need row-level security in the same migration. See `docs/architecture/sprint1-schema.md`.

## Contributor licence

A contributor licence agreement will be required before the first external pull request is merged, so the maintainer can offer a commercial licence and run the hosted cloud. The process note is [docs/cla.md](docs/cla.md). Have a lawyer review the agreement text before it is turned on. Until then, opening a pull request means you agree that your contribution is licensed under AGPL-3.0.

## Conduct

[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
