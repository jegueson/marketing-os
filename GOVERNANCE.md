# Governance

Marketing OS is a maintainer-led open-source project, not a foundation.

## Roles

- **Maintainer.** Sets roadmap priority in `tasks.md`, merges pull requests, handles security reports, and decides what is in or out of the public repo. The maintainer is the GitHub owner of this repository.
- **Contributor.** Opens issues and pull requests under [CONTRIBUTING.md](CONTRIBUTING.md) and the [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- **Specialist (commercial).** Configures customer skills under a services contract. That work is not a governance role in this repo.

## Decisions

Architecture decisions that are hard to reverse go in `docs/adr/` before the code that depends on them. Product scope changes go in `Planning/` as an addendum, not as a surprise in a pull request.

The maintainer may reject changes that violate the pilot guardrails in `tasks.md`, even when the code is good. Those guardrails exist so the first release finishes.

## Private package

The hosted cloud's billing and provisioning are maintained by the same maintainer in a private repository. They must keep working against the public interfaces. Breaking `BillingProvider` or `ProvisioningHooks` is a public API change and needs an ADR.
