# Specialist configuration

Skills, agents, workflows, and profiles are versioned data for one tenant workspace. A specialist changes them without a Worker deploy. The contract is [ADR-0026](adr/0026-specialist-configuration.md). YAML import and export rules are [ADR-0014](adr/0014-customer-config-yaml.md).

The `specialist_config` flag ships **off**. Config routes and the console configuration section stay hidden until you enable it.

## Before you configure

1. Finish [self-hosting.md](self-hosting.md). `mos setup` seeds the starter library into the setup tenant (including the weekly performance review skill) and sets `starterSkillsSeeded` in `.mos/setup.json`.
2. Connect **Mock**, select a scope, and sync so `mock.spend` has data (same path as [ask-marketing.md](ask-marketing.md)).
3. Enable the flag:

```bash
psql "$DATABASE_URL" -c "update feature_flags set is_enabled = true where key = 'specialist_config';"
```

4. Sign in as `ai_specialist` or `platform_admin` for writes. `customer_admin` and `success_manager` can read. `customer_user` cannot.

## Weekly performance review example

The committed example is the Sprint 4 exit path. A new installer finds it here:

| Piece | Path |
| --- | --- |
| Starter skill | [skills/starter/weekly-performance-review/skill.yaml](../skills/starter/weekly-performance-review/skill.yaml) |
| Example workflow | [customer-configs/examples/weekly-performance-review/workflow.yaml](../customer-configs/examples/weekly-performance-review/workflow.yaml) |
| Business profile | [customer-configs/examples/weekly-performance-review/business-profile.yaml](../customer-configs/examples/weekly-performance-review/business-profile.yaml) |
| Fixture metrics (unit tests) | [customer-configs/examples/weekly-performance-review/fixture-metrics.json](../customer-configs/examples/weekly-performance-review/fixture-metrics.json) |
| How to write a skill | [skills/WRITING.md](../skills/WRITING.md) |

After setup, the setup tenant already has the published weekly review skill. To load the matching workflow and profile into a workspace (or to re-import after an edit):

1. `POST /api/v1/workspaces/{workspaceId}/config/import` with `{ "kind": "skill", "source": "<yaml>" }` (or skip if setup already seeded it).
2. Import the workflow YAML the same way with `"kind": "workflow"`.
3. `PUT` the business profile JSON (same fields as the example YAML), then `POST .../profiles/business/publish`.
4. `POST .../workflows/{workflowId}/test-runs`. The report body includes `mock.spend` and the synced figure (for the mock connector, `2550` when the last-30-days window is covered).

The API journey that proves this path is `e2e/tests/sprint4.api.test.ts`. The security checklist is [security/s4-review.md](security/s4-review.md).

## Add a skill without a deploy

Follow [skills/WRITING.md](../skills/WRITING.md). Short version: edit YAML that matches `skillDefinitionSchema`, import, publish, point a workflow `run_skill` step at `name` + `version`. Do not put prompt bodies in run rows, audit payloads, or logs.

## Limits in this sprint

- Autonomy stays `observe`. No connector actions from a workflow.
- Manual test-runs only. Stored schedules do not fire yet.
- Knowledge retrieval returns an empty chunk list until the knowledge tasks land.
- No release tag was cut for this documentation pass.
