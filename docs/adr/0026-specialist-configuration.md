# ADR-0026: Specialist configuration is versioned data

**Date**: 2026-11-23
**Status**: accepted
**Deciders**: product requirements, architecture review

## Context

Sprint 4 makes a tenant configurable without a code deploy. ADR-0014 already says the database holds the runtime copy and YAML is import and export. ADR-0012 says automations call `WorkflowPort`. ADR-0015 says the default autonomy is observe. ADR-0025 leaves a `PromptSource` port so a database source can sit beside the code catalog. None of those records say what a skill, an agent, a workflow step, or a knowledge locator is allowed to contain.

A specialist can otherwise put an action name, a model-written SQL string, or a URL into a definition and have the runner treat it as trusted.

## Decision

1. **Documents share one shape for draft and published.** `packages/schemas` defines `BusinessProfile`, `BrandProfile`, `SkillDefinition`, `AgentDefinition`, `WorkflowDefinition`, and `KnowledgeSource`. Status is a column on the row, not a field in the document, so an export cannot disagree with the version table. Publishing copies the document into an append-only version row and points the active version at it. Published rows are not updated. Rollback publishes a new version that copies an older document.

2. **A skill is not an agent and not a workflow.** A skill is a versioned instruction, a closed field list for input and output (not arbitrary JSON Schema), context keys (`business_profile`, `brand_profile`, `metrics`, `knowledge`), a tool allowlist, a risk class, and an evaluation suite id. It has no trigger.

3. **An agent only observes in this sprint.** An agent binds a goal, skill versions, a tool allowlist, knowledge source ids, and a model purpose (`analysis` or `drafting`). The autonomy field is the literal `observe`. `controlled_autonomy` is rejected until Sprint 5 has an approval policy. On publish, the agent's tools must be a subset of its published skills' tools. The schema cannot check that subset; the repository does.

4. **A tool allowlist names connector read tools.** Each entry is `{ connector, tool }` and matches `listTools` on that connector. The object is strict, so an `action` field fails validation. `listActions` names are not tools. Sprint 4 runs no action.

5. **A workflow is an ordered list of typed steps.** The kinds are `load_context`, `read_metrics`, `retrieve_knowledge`, `run_skill`, and `render_report`. A step may name only earlier step ids. Metric steps reuse the Ask metric key and range presets. The trigger is `manual` or a structured schedule (`minute`, `hour`, `dayOfWeek`) whose minute is a single integer, so a definition cannot ask to run every minute. The Sprint 4 runner executes `manual` test runs. A stored schedule does not fire until a later task in this sprint turns it on, and it still cannot call an action.

6. **One Workflows class interprets data.** Customer workflows are rows, not new Cloudflare Workflow classes. `packages/workflow` exposes `WorkflowPort`. The Cloudflare adapter is one `ConfigWorkflow` that runs the published step list. Tests use an in-memory adapter. Domain code does not import the Cloudflare SDK.

7. **Platform prompts stay in code.** A tenant prompt name matches `tenant/<slug>`. `ask.plan` and `ask.answer` cannot be shadowed. The code catalog is checked first.

8. **Knowledge locators are bare keys.** A source is `notion` or `r2_upload`. The locator is ASCII letters, digits, `.`, `_`, `-`, and `/` between segments. It cannot be a URL, a parent path, or a leading-dot path. Ingest resolves it under that tenant's prefix. Chunks use `vector(1536)`. A different embedding width fails the ingest. Retrieval is tenant-scoped.

9. **Who may write.** `config:write` is `ai_specialist` and `platform_admin`. `config:read` adds `success_manager` and `customer_admin`. `customer_user` has neither. The `specialist_config` flag defaults off. Routes return 404 while it is off.

## Alternatives Considered

### Alternative 1: Arbitrary JSON Schema and cron strings inside the definition

- **Pros**: Specialists could express any output and any clock schedule.
- **Cons**: A second schema language, and a cron of `* * * * *` is a self-inflicted outage. The runner would have to sandbox both.
- **Why not**: A closed field list and a structured schedule are enough for the weekly performance review.

### Alternative 2: One Cloudflare Workflow class per customer workflow

- **Pros**: Matches the usual Workflows tutorial.
- **Cons**: A new workflow would need a deploy, which ADR-0014 forbids for ordinary configuration.
- **Why not**: One interpreter class keeps the definition in the database.

## Consequences

### Positive

- The weekly performance review can be imported as YAML and run against mock metrics without a release.
- The same Zod schemas validate the API, the YAML loader, and the runner.

### Negative

- Sprint 4 cannot express a write, an approval, or a skill output that is a nested object. Those wait for a schema change.

### Risks

- A schedule row can exist before the cron fires it. The runner must refuse a schedule trigger until that task is on, instead of ignoring the trigger field.
