# Writing a skill (no deploy)

Skills are YAML. A specialist adds or edits them in the customer workspace through import — not by shipping a Worker build. Installer overview: [docs/specialist-configuration.md](../docs/specialist-configuration.md).

## Shape

Put one skill in its own folder under `skills/starter/` (or under a customer config pack):

```text
skills/starter/<skill-name>/skill.yaml
```

`mos setup` seeds every valid starter `skill.yaml` into the setup tenant once. Invalid or legacy stubs are skipped.

## Add or change a skill without a deploy

1. Write or edit `skill.yaml` so it matches `skillDefinitionSchema` (name, version, domain, instructions, outputs, tools allowlist, risk class).
2. Import it into the tenant (console import or `importConfigYaml` in staff tooling).
3. Publish. The published version is what workflows call.
4. Point a workflow `run_skill` step at `name` + `version`.
5. Re-import to revise; publish creates the next version. Do not edit Postgres by hand.

Tools in the allowlist must exist in the connector catalog (for the starter weekly review: `mock` / `list_campaigns`).

## Example

```yaml
name: weekly-performance-review
version: 1.0.0
description: Compare the primary KPIs with the previous period.
domain: performance
inputs: []
contextRequirements:
  - business_profile
  - metrics
tools:
  - connector: mock
    tool: list_campaigns
instructions: >
  Use only the metric values in the input. Do not invent numbers.
  Summarise what changed between the current and previous period.
outputs:
  - name: summary
    type: string
    description: What changed
    required: true
evaluationSuite: weekly-performance-review
riskClass: low
```

Copy that block, change `name` / `instructions` / `outputs`, import, publish. No release tag required.
