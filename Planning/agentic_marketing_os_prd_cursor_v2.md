# PRD — AI Marketing Operating System
## Product Requirements Document for Cursor
### Version 2 — September 2026

---

# 1. Product Mission

Build a **marketing-only AI operating system** that connects a customer's existing marketing technology stack, collects and normalizes authorized marketing data, displays the data through a unified Marketing Cockpit, provides a conversational interface to that data, and enables internal AI marketing specialists to configure customer-specific skills, agents, prompts, knowledge, workflows and automations.

The product is not primarily self-service SaaS.

The platform is the software infrastructure used by the company to deliver a managed, tailor-made AI marketing capability.

The customer should be able to:

1. Submit a business problem through a lead form.
2. Enter a discovery process with a Success Manager.
3. Receive credentials after qualification/onboarding.
4. Connect its existing marketing tools.
5. See a pre-configured Marketing Cockpit.
6. Ask questions about its own connected data.
7. Collaborate with the company's AI marketing specialist.
8. Receive tailored skills and automations.
9. Approve or monitor actions.
10. Continuously improve the marketing operation.

The company should be able to:

1. Manage leads and prospects.
2. Convert leads into customer workspaces.
3. Provision customer accounts.
4. Configure integrations.
5. Inspect customer data.
6. Build customer-specific skills.
7. Configure agents and workflows.
8. Configure brand guidelines and knowledge.
9. Configure prompts and model choices.
10. Create automations.
11. Test/evaluate outputs.
12. Monitor execution.
13. Measure business outcomes.

---

# 2. Product Thesis

The product is not "a collection of AI agents."

The product is a **Marketing Operating System**.

Its primary loop is:

**CONNECT → UNDERSTAND → DISPLAY → ASK → DESIGN → AUTOMATE → EXECUTE → MEASURE → IMPROVE**

The first visible value is the cockpit.

The ultimate value is the absorption of recurring marketing work.

---

# 3. Explicit Product Boundary

## In scope

- marketing analytics,
- performance marketing,
- paid media,
- SEO,
- AEO/GEO where data is available,
- website analytics,
- UX/CRO,
- A/B testing and experimentation,
- creative operations,
- brand operations,
- CRM marketing,
- customer lifecycle,
- retention,
- lead generation,
- lead management,
- lead nurturing,
- lead hunting,
- market intelligence,
- tracking,
- cookies/consent monitoring,
- marketing governance,
- marketing reporting,
- project/task orchestration for marketing work.

## Out of scope

- customer-service chatbot products,
- call center automation,
- generic sales automation,
- sales CRM replacement,
- general employee copilots,
- generic enterprise workflow platforms outside marketing.

The system may write to sales/CRM systems when required by a marketing workflow, but the product remains marketing-owned.

---

# 4. Commercial Access Model

There is **no public self-service signup**.

There is no public subscription checkout.

The customer enters through a lead form and is provisioned after a commercial/onboarding step.

## User lifecycle

```text
Anonymous visitor
   ↓
Lead form
   ↓
Prospect
   ↓
Success Manager discovery
   ↓
Qualified opportunity
   ↓
Customer / Design Partner
   ↓
Customer workspace provisioned
   ↓
Customer connects stack
   ↓
Marketing Cockpit activated
   ↓
Tailored AI build
   ↓
Managed Marketing OS
```

---

# 5. User Roles

## 5.1 Anonymous Prospect

Can:
- view public marketing pages,
- submit lead form.

Cannot:
- access the application.

## 5.2 Customer Admin

Can:
- log in,
- manage company profile,
- connect integrations,
- select data scopes,
- manage approved users,
- configure model/provider preferences,
- maintain brand guidelines,
- review knowledge sources,
- configure selected prompts/preferences,
- view dashboard,
- ask data questions,
- view automations,
- approve actions according to policy.

Cannot by default:
- create unrestricted production agents,
- bypass approval policies,
- access other tenants.

## 5.3 Customer Marketing User

Can:
- view relevant dashboards,
- ask questions,
- view recommendations,
- review assigned work,
- approve allowed actions,
- provide feedback.

## 5.4 Success Manager

Internal role.

Can:
- access assigned customer workspaces,
- review account status,
- read goals and business context,
- coordinate setup,
- create/assign implementation tasks,
- review adoption and value.

## 5.5 AI Marketing Specialist

Internal expert role.

Can:
- access assigned customer workspace,
- inspect connected data,
- configure skills,
- configure agents,
- configure prompts,
- maintain brand profile,
- configure knowledge sources,
- build workflows,
- configure automations,
- configure tool permissions,
- run evaluations,
- test output,
- create customer-specific templates,
- monitor and improve production workflows.

## 5.6 Platform Admin

Can:
- manage tenants,
- manage connectors,
- manage platform policies,
- manage model providers,
- manage system templates,
- manage feature flags,
- manage platform security.

---

# 6. Primary Product Flow

## Step 1 — Lead Form

Public web form captures:

- company name,
- contact name,
- email,
- job title,
- country/market,
- industry,
- marketing team size,
- major channels,
- marketing technology stack,
- major problem,
- objectives,
- optional spend/revenue range,
- current agency/consultancy usage,
- free-text briefing.

Create:

```text
Lead
LeadSource
LeadBrief
```

## Step 2 — Success Manager workspace

The internal application must allow the Success Manager to:

- review lead,
- add discovery notes,
- identify business problems,
- map existing stack,
- define pilot objectives,
- define desired outcomes,
- recommend first integrations,
- convert lead into customer.

## Step 3 — Provision Customer

On conversion:

- create Tenant,
- create Workspace,
- create Customer Admin,
- send secure invitation,
- create onboarding checklist.

## Step 4 — Integration Onboarding

Customer logs in and connects tools.

## Step 5 — Initial Sync

The platform:

- validates connection,
- retrieves schemas,
- discovers accounts/properties,
- imports authorized data,
- calculates data-health indicators,
- maps data into canonical marketing entities.

## Step 6 — Cockpit Generation

Once minimum data requirements are met, populate the standard dashboard framework.

## Step 7 — Ask Marketing

Enable conversational access to customer data.

## Step 8 — Specialist Configuration

Internal AI marketing specialist can now create:

- skills,
- workflows,
- automations,
- prompts,
- brand context,
- policies,
- specialized agents.

## Step 9 — Managed Operation

Monitor → improve → expand.

---

# 7. Application Surfaces

The application should have two primary products under one authentication system.

## 7.1 Customer Portal

Navigation:

```text
Home
Cockpit
Performance
Organic
Brand
Retention
Leads
Market Intelligence
Tracking
Work / Automations
Ask Marketing
Integrations
Knowledge & Brand
Approvals
Reports
Settings
```

The exact visible modules should be feature-flagged by customer configuration.

## 7.2 Internal Specialist Console

Navigation:

```text
Customers
Leads
Onboarding
Customer Health
Cockpit Configuration
Data Sources
Knowledge
Brand Profiles
Skills
Agents
Workflows
Automations
Prompts
Models
Policies
Approvals
Evaluations
Runs
Audit
Outcomes
Templates
```

The internal console is a critical part of the product and must not be treated as an admin afterthought.

---

# 8. Marketing Cockpit

The cockpit is the first central customer-facing experience.

## 8.1 Executive Overview

Show:

- business goals,
- KPI performance,
- major changes,
- anomalies,
- opportunities,
- risks,
- marketing spend,
- pipeline/revenue contribution where available,
- retention,
- active experiments,
- agent activity,
- unresolved approvals,
- recent actions.

## 8.2 Functional Areas

### Performance

- paid channel performance,
- spend,
- traffic,
- leads,
- conversions,
- pipeline,
- revenue,
- efficiency metrics.

### Organic

- organic traffic,
- keyword visibility,
- content trends,
- technical health,
- opportunity areas.

### UX/CRO

- page performance,
- funnel leakage,
- conversion rate,
- form performance,
- experiments.

### Brand

- creative output,
- creative performance,
- message themes,
- asset health,
- brand compliance indicators.

### Retention

- lifecycle cohorts,
- retention,
- churn,
- engagement,
- journey performance.

### Leads

- volume,
- quality,
- source,
- stage,
- nurture,
- pipeline conversion.

### Market Intelligence

- reviews,
- social signals,
- sentiment/theme trends,
- competitor signals.

### Tracking & Governance

- tracking events,
- tags/pixels,
- UTMs,
- consent,
- data issues,
- governance tasks.

---

# 9. Data Collection Strategy

The platform must optimize for **breadth and quality of authorized data collection**.

Important distinction:

> Connect broadly, normalize selectively, retain appropriately.

The platform should discover and connect as many relevant customer data sources as practical, while avoiding unnecessary duplication of data that is better queried from source systems.

## Data source categories

- Analytics
- Advertising
- CRM
- Marketing automation
- SEO/search
- Social
- CMS/web
- Creative
- Customer feedback
- Experimentation
- CDP
- Data warehouse
- Project/task management
- Consent/tracking
- Internal knowledge

## Data health

Every source has:

- connection status,
- last sync,
- scope,
- freshness,
- schema state,
- record volume where available,
- error state,
- permission status.

---

# 10. Canonical Marketing Data Model

The system must define a provider-neutral semantic layer.

Core entities:

```text
Tenant
Workspace
BusinessUnit
Market
User
Goal
KPI
Channel
Source
Campaign
CampaignGroup
Ad
Creative
Asset
Audience
Segment
LandingPage
Session
Touchpoint
Lead
Contact
Account
Customer
Opportunity
Product
Offer
Journey
JourneyStep
Experiment
ExperimentVariant
MetricDefinition
MetricValue
Revenue
Review
SocialSignal
Competitor
TrackingEvent
TrackingIssue
ConsentSignal
Task
Recommendation
Insight
Action
Outcome
```

Every normalized metric must include:

- definition,
- source,
- source field,
- transformation,
- time period,
- filters,
- freshness,
- quality/confidence status.

Never silently merge two metrics with different definitions.

---

# 11. Connector Framework

Build a reusable connector SDK.

## Connector contract

Every connector should implement:

```text
get_metadata()
authenticate()
test_connection()
list_resources()
get_resource()
get_schema()
query()
query_metrics()
health_check()
available_tools()
available_actions()
```

Actions should define:

- action name,
- description,
- input schema,
- output schema,
- required permissions,
- risk classification,
- approval requirement,
- idempotency behavior,
- rollback approach where available.

## Priority connectors

Phase 1 should prioritize the stack patterns most likely across customers:

- Google Analytics 4,
- Google Ads,
- Meta Ads,
- LinkedIn,
- TikTok,
- Google Search Console,
- Salesforce,
- HubSpot,
- Asana,
- Jira,
- Linear,
- Notion,
- generic REST/API connector,
- MCP-compatible tools.

Later:

- Adobe,
- Figma,
- Canva,
- CDPs,
- consent platforms,
- experimentation tools,
- social listening/review platforms,
- data warehouses,
- CMS platforms,
- ComfyUI.

---

# 12. Integration UX

## Customer experience

```text
Integrations
  ↓
Select provider
  ↓
Authenticate
  ↓
Choose account/property/workspace
  ↓
Choose permitted data scope
  ↓
Test
  ↓
Initial sync
  ↓
Data health
```

Never automatically import every discoverable account.

The customer must explicitly approve scopes.

## Reconnection

Support:

- OAuth expiration,
- revoked access,
- permission changes,
- refresh failures,
- API version errors.

The UI must provide actionable resolution guidance.

---

# 13. Model Gateway

Create a provider-neutral `ModelGateway`.

Required capabilities:

```text
list_models()
get_model_capabilities()
complete()
stream()
embed()
moderate_if_available()
estimate_cost()
```

Providers initially supported through adapters:

- OpenAI,
- Anthropic.

Design for later:

- Google,
- customer-managed/private models.

The customer can choose a preferred provider/model where contractually supported.

The platform must be able to enforce:

- allowed models,
- maximum context,
- cost limits,
- privacy requirements,
- fallback rules,
- evaluation requirements.

Never reference provider SDKs directly from business logic.

---

# 14. Ask Marketing

This is the first conversational AI experience.

## Requirements

A user can ask natural-language questions about authorized customer data.

Examples:

- "Why did leads decline?"
- "Which campaigns are inefficient?"
- "Compare acquisition channels using qualified leads."
- "What changed last month?"
- "Where are we losing conversion?"

## Query process

```text
User question
  ↓
Intent classification
  ↓
Retrieve tenant context
  ↓
Retrieve metric definitions
  ↓
Select relevant data sources
  ↓
Generate query plan
  ↓
Execute read-only queries/tools
  ↓
Validate results
  ↓
Generate answer
  ↓
Show source/evidence and freshness
```

## Trust requirements

Answers must show:

- source(s),
- time range,
- key filters,
- freshness,
- data-quality warnings,
- assumptions where relevant.

The answer should distinguish observed data from AI interpretation.

---

# 15. Customer Context System

Each customer must have a structured business context.

Entities:

```text
BusinessProfile
BusinessGoal
MarketingGoal
AudienceDefinition
ProductProfile
MarketProfile
BrandProfile
CompetitorProfile
BusinessRule
CustomerTerminology
```

## Business Profile

Include:

- company description,
- business model,
- products,
- markets,
- business goals,
- marketing goals,
- primary KPIs,
- reporting cadence.

## Brand Profile

Include:

- positioning,
- audience,
- tone,
- preferred terms,
- banned terms,
- visual guidance,
- approved claims,
- prohibited claims,
- market/language guidance,
- example assets.

---

# 16. Specialist Console — Customer Configuration

The AI Marketing Specialist must have a structured configuration workflow.

## Configuration sequence

```text
Understand business
  ↓
Review connected stack
  ↓
Review data
  ↓
Define use case
  ↓
Select/create skills
  ↓
Define prompt/context
  ↓
Select model
  ↓
Select tools
  ↓
Define policy
  ↓
Define workflow
  ↓
Test/evaluate
  ↓
Deploy
  ↓
Monitor
```

The UI must expose the configuration in a way that allows a specialist to understand exactly what a customer-specific automation is doing.

---

# 17. Skill System

A skill is a reusable unit of marketing capability.

Skill schema:

```text
Skill
  id
  name
  description
  domain
  version
  inputs
  context_requirements
  tools
  instructions
  output_schema
  evaluation_suite
  risk_class
  owner
  status
```

Examples:

- Analyze paid performance.
- Build funnel diagnosis.
- Detect creative fatigue.
- Audit UTM taxonomy.
- Build lead segment.
- Analyze retention cohort.
- Generate creative brief.
- Compare customer-review themes.

Skills may be:

- platform-provided,
- specialist-created,
- customer-specific,
- industry-specific.

---

# 18. Agent System

An agent combines:

```text
Goal
+ Context
+ Skills
+ Tools
+ Knowledge
+ Model
+ Memory
+ Policies
+ Evaluation
```

Examples:

- Performance Analyst.
- CMO Intelligence Agent.
- Lead Intelligence Agent.
- CRM Lifecycle Agent.
- Creative Strategist.
- Creative QA Agent.
- SEO Analyst.
- Market Intelligence Agent.
- Tracking QA Agent.

Agents should be composable.

Do not hard-code customer logic into source code.

Prefer configuration + versioned definitions.

---

# 19. Workflow System

Workflows combine deterministic steps, skills, agents and tools.

Example:

```text
Schedule
  ↓
Fetch performance
  ↓
Normalize metrics
  ↓
Compare to goals
  ↓
Detect anomalies
  ↓
Diagnose
  ↓
Analyze creative
  ↓
Analyze CRM impact
  ↓
Generate recommendations
  ↓
Create tasks
  ↓
Approval gate if needed
  ↓
Execute
  ↓
Measure outcome
  ↓
Report
```

Workflows must be:

- versioned,
- resumable,
- observable,
- retryable,
- idempotent where practical,
- tenant-scoped.

---

# 20. Automation Framework

An automation is a production workflow with a trigger.

Trigger types:

- schedule,
- webhook,
- source data threshold,
- anomaly,
- new lead,
- new review,
- campaign state change,
- manual run.

Automation definition:

```text
Automation
  trigger
  conditions
  workflow
  policy
  approval_requirement
  notification_rules
  enabled
```

---

# 21. Examples of Tailored Customer Automations

## 21.1 Weekly performance review

Trigger: every Monday.

Actions:

- ingest data,
- compare KPIs,
- diagnose meaningful movements,
- create recommendations,
- create marketing tasks,
- compile report.

## 21.2 Creative studio

Trigger: creative opportunity identified.

Actions:

- gather performance evidence,
- create brief,
- generate concepts,
- invoke image/video workflow such as ComfyUI,
- validate brand rules,
- send approval,
- publish through approved connector,
- measure results.

## 21.3 Lead intelligence

Trigger: new lead or batch.

Actions:

- enrich,
- score,
- categorize,
- identify intent,
- write to CRM,
- add to nurture path,
- report quality.

## 21.4 Tracking monitor

Trigger: event anomaly.

Actions:

- detect issue,
- identify likely source,
- create QA task,
- notify responsible owner,
- recheck after fix.

---

# 22. Agency Replacement Tracking

The product should explicitly track which categories of external/internal marketing work are being absorbed.

Create entity:

```text
WorkloadCategory
  reporting
  media_optimization
  seo
  crm_operations
  creative_production
  research
  tracking_qa
  project_coordination
  etc.
```

For each customer, capture:

- baseline human hours,
- baseline agency/consulting cost where customer provides it,
- hours absorbed,
- workflows automated,
- estimated savings,
- actual performance impact where measurable.

This becomes a customer-value dashboard and an important commercial metric.

---

# 23. CMO Cockpit Requirements

## Header

Show:

- company/workspace,
- selected period,
- freshness state,
- alerts.

## Executive KPI cards

Configurable per customer.

Each KPI must include:

- value,
- previous period,
- target,
- delta,
- source,
- freshness.

## Performance pulse

Visualize meaningful changes rather than every available metric.

## Attention queue

Show:

- anomalies,
- risks,
- overdue actions,
- opportunities,
- data issues.

## Recommended actions

Each recommendation has:

- problem,
- evidence,
- proposed action,
- expected impact,
- confidence,
- effort,
- approval status.

## Automation status

Show:

- active automations,
- recent runs,
- failures,
- pending approvals,
- work absorbed.

---

# 24. Performance Module

Capabilities:

- channel overview,
- campaign performance,
- budget pacing,
- anomaly detection,
- creative performance,
- audience performance,
- funnel diagnosis,
- recommendations.

The module must support customer-specific KPI formulas.

For example:

`QualifiedLeadCAC` must not be hard-coded as equivalent to `LeadCAC`.

---

# 25. Organic / SEO Module

Capabilities:

- technical issues,
- search performance,
- content opportunities,
- competitor visibility,
- content decay,
- internal linking opportunities,
- structured data checks,
- AEO/GEO visibility where provider data exists.

---

# 26. Brand Studio

The Brand Studio must connect creativity with performance.

Capabilities:

- brand knowledge,
- creative briefs,
- messaging frameworks,
- multi-asset creation,
- language variants,
- channel variants,
- asset metadata,
- approval,
- performance learning.

## ComfyUI support

Treat ComfyUI as a tool/workflow connector rather than hard-coding it into the brand module.

A specialist should be able to configure:

```text
Brand Profile
→ Prompt Template
→ ComfyUI workflow
→ Output schema
→ Quality checks
→ Approval
```

---

# 27. CRM / Retention Module

Capabilities:

- lifecycle cohort analysis,
- segmentation,
- churn-risk signals,
- onboarding,
- activation,
- engagement,
- retention,
- win-back,
- journey analysis,
- campaign performance.

The system may execute marketing actions through CRM/marketing automation connectors.

It must not become a generic sales/service platform.

---

# 28. Lead Engine

Capabilities:

- capture,
- normalization,
- deduplication,
- enrichment,
- scoring,
- qualification,
- intent,
- routing,
- nurture,
- source analysis,
- lead-quality analysis.

## Lead hunting

Support marketing-oriented target discovery:

- target accounts,
- target companies,
- segments,
- trigger signals,
- relevant decision-maker profiles,
- intent signals.

Do not build a general-purpose sales engagement platform.

---

# 29. Market Intelligence Module

Sources:

- customer reviews,
- app-store reviews,
- social signals,
- search trends,
- competitor websites,
- competitor advertising libraries,
- licensed research feeds,
- customer-provided feedback.

Outputs:

- recurring themes,
- sentiment movement,
- customer language,
- competitor messaging,
- emerging topics,
- opportunities.

Use official APIs/licensed data where possible.

---

# 30. Tracking & Consent Module

Capabilities:

- tag inventory,
- pixel inventory,
- event taxonomy,
- UTM rules,
- conversion checks,
- consent state checks,
- tracking QA,
- data-flow checks.

The module should produce technical findings, not present itself as a provider of legal advice.

---

# 31. Governance / Policy Engine

The system must support machine-readable policy.

Policy scope can be:

- tenant,
- workspace,
- role,
- skill,
- agent,
- connector,
- action,
- market,
- campaign.

Example:

```json
{
  "name": "Paid Media Budget Guardrail",
  "action": "update_campaign_budget",
  "max_change_percent": 5,
  "require_approval_above_percent": 5,
  "currency_limit": 5000,
  "allowed_roles": ["customer_admin", "ai_marketing_specialist"]
}
```

---

# 32. Approval System

Approval requirements must be configurable.

Approval object:

```text
Approval
  requester
  reviewer
  action
  risk_level
  evidence
  expected_impact
  status
  decision
  timestamp
  comment
```

Status:

```text
PENDING
APPROVED
REJECTED
EXPIRED
CANCELLED
```

Customer-facing approval screens should clearly explain:

- what will change,
- why,
- evidence,
- expected effect,
- risk,
- requester.

---

# 33. Agent Autonomy

Use:

```text
OBSERVE
RECOMMEND
DRAFT
APPROVAL_REQUIRED
CONTROLLED_AUTONOMY
```

Default: OBSERVE.

Controlled autonomy requires:

- successful evaluation suite,
- explicit policy,
- scoped tools,
- thresholds,
- monitoring,
- rollback strategy where feasible.

---

# 34. Knowledge System

Support:

- documents,
- URLs where permitted,
- structured knowledge,
- customer-provided files,
- brand assets,
- product information,
- strategy documents,
- campaign briefs.

Every knowledge item should have:

- source,
- owner,
- version,
- effective date where relevant,
- visibility scope,
- status.

---

# 35. Prompt Management

Prompts are first-class versioned objects.

Prompt definition:

```text
PromptTemplate
  name
  version
  purpose
  system_instructions
  context_bindings
  examples
  output_schema
  model_constraints
  evaluation_suite
  status
```

Customer-specific prompt configuration must not require code changes.

---

# 36. Customer-Specific Configuration Model

The system must separate:

### Platform code
Shared product functionality.

### Platform templates
Reusable skills, workflows and agents.

### Customer configuration
Customer-specific goals, prompts, rules, connectors, knowledge, brand profile, metrics and workflow settings.

### Custom specialist implementation
Special workflows or tools built for one customer.

This separation is critical for scale.

---

# 37. Internal Specialist Experience

The specialist should be able to answer:

- What does this customer care about?
- What data do we have?
- What data is missing?
- What is the current stack?
- What work are we trying to automate?
- Which skill handles it?
- Which model is being used?
- Which tools are available?
- What policy applies?
- What evaluation proves it is safe?
- What happened in production?
- What should we improve?

The internal console should feel like an **AI solution engineering environment for marketing**.

---

# 38. Data Architecture

Recommended initial stack:

## Frontend

- Next.js
- React
- TypeScript
- Tailwind
- shared component library
- React Query or equivalent
- Zod

## Backend

- Python 3.12+
- FastAPI
- Pydantic
- SQLAlchemy
- async workers

## Primary database

- PostgreSQL
- pgvector

## Queue/cache

- Redis

## Object storage

- S3-compatible storage

## Analytical scale

Start with PostgreSQL plus warehouse integrations.

Introduce a dedicated analytical store only when volumes justify it.

## Workflow

Use a durable workflow abstraction designed to support Temporal or an equivalent system.

---

# 39. Multi-Tenancy & Security

Every customer data object must be tenant-scoped.

Recommended hierarchy:

```text
Tenant
  Workspace
    BusinessUnit
      Market
```

Users can belong to multiple tenants.

Enforce:

- tenant isolation,
- RBAC,
- least privilege,
- encryption in transit/at rest,
- secret vaulting,
- audit logging,
- data retention controls,
- PII classification.

Do not expose customer data to another tenant through prompts, embeddings, logs or evaluation datasets.

---

# 40. Core Database Entities

Minimum entities:

```text
Tenant
Workspace
User
Role
Permission
Invitation
Lead
LeadBrief
Opportunity
SuccessManagerNote
OnboardingProject
CustomerGoal
BusinessProfile
BrandProfile
KnowledgeSource
KnowledgeDocument
Connector
Connection
CredentialReference
DataScope
SyncRun
DataHealth
MetricDefinition
MetricValue
Dashboard
DashboardWidget
Agent
AgentVersion
Skill
SkillVersion
PromptTemplate
PromptVersion
Workflow
WorkflowVersion
Automation
AutomationRun
Tool
ToolCall
Policy
Approval
Insight
Recommendation
Action
Outcome
Campaign
Creative
Asset
Lead
Customer
Contact
Account
Journey
Experiment
Review
SocialSignal
TrackingEvent
TrackingIssue
Report
AuditEvent
FeatureFlag
```

---

# 41. API Design

Use REST for core application APIs.

Potential namespaces:

```text
/api/v1/leads
/api/v1/opportunities
/api/v1/tenants
/api/v1/workspaces
/api/v1/users
/api/v1/integrations
/api/v1/connections
/api/v1/data-health
/api/v1/cockpit
/api/v1/metrics
/api/v1/ask
/api/v1/skills
/api/v1/agents
/api/v1/prompts
/api/v1/workflows
/api/v1/automations
/api/v1/policies
/api/v1/approvals
/api/v1/runs
/api/v1/outcomes
/api/v1/audit
```

Use typed schemas and explicit error models.

---

# 42. Event Architecture

Events should support:

- integration.connected,
- integration.failed,
- sync.started,
- sync.completed,
- data.quality_changed,
- lead.created,
- customer.provisioned,
- skill.updated,
- workflow.started,
- workflow.completed,
- automation.triggered,
- recommendation.created,
- approval.requested,
- approval.completed,
- action.executed,
- action.failed,
- outcome.recorded.

All events must be tenant-scoped.

---

# 43. Observability

Every agent/workflow execution must have:

- run ID,
- tenant ID,
- initiated_by,
- parent run if applicable,
- model,
- tools used,
- latency,
- token/cost estimate,
- action count,
- status,
- error data,
- evaluation state.

Use structured logs and OpenTelemetry.

---

# 44. Evaluation Framework

Every production skill/agent must have an evaluation suite appropriate to its risk.

Examples:

### Analytical skill

Check:

- metric correctness,
- source correctness,
- arithmetic,
- explanation grounding.

### Creative skill

Check:

- brand compliance,
- required facts,
- forbidden claims,
- output format.

### Execution workflow

Check:

- correct target,
- correct permissions,
- correct action,
- policy enforcement,
- idempotency.

No production autonomous workflow without a passing evaluation suite.

---

# 45. Auditability

Audit all significant events:

- login,
- integration changes,
- data-scope changes,
- prompt changes,
- skill changes,
- agent deployment,
- workflow changes,
- approval decisions,
- tool actions,
- data exports,
- automation runs.

Audit records must be immutable from the application layer.

---

# 46. Initial Pilot Scope

The first pilot should NOT attempt to implement the entire product.

## Must Have

### Commercial / onboarding

- public lead form endpoint,
- internal lead management,
- Success Manager workspace,
- customer provisioning,
- invitations,
- onboarding checklist.

### Integrations

Start with a representative customer stack, ideally including:

- GA4,
- Google Ads,
- Meta,
- Salesforce or HubSpot,
- one project tool such as Asana/Linear/Jira,
- one knowledge system such as Notion.

Add TikTok/LinkedIn when justified by pilot scope.

### Cockpit

- executive overview,
- performance section,
- funnel section,
- leads section,
- integrations/data-health section,
- configurable KPI definitions.

### Ask Marketing

- model gateway,
- natural-language questions,
- read-only data retrieval,
- evidence/source display.

### Specialist console

- customer context,
- brand profile,
- prompts,
- skills,
- basic agents,
- workflow configuration.

### Automation

Implement 2–5 real customer workflows.

### Governance

- RBAC,
- approvals,
- audit log.

---

# 47. Pilot Should NOT Include

Do not build all of these before proving value:

- 50+ native integrations,
- public agent marketplace,
- fully autonomous media buying,
- generalized sales automation,
- generalized customer service,
- complex no-code workflow builder for customers,
- every creative generation provider,
- advanced benchmarking before enough data exists,
- broad consumer product.

Use adapters, configuration and specialist-led implementation to keep the product flexible.

---

# 48. Pilot Success Criteria

## Business

- customer sees measurable time-to-insight improvement,
- recurring reporting work is materially reduced,
- at least one agency/consulting workflow is absorbed or reduced,
- at least 2 automated marketing workflows run reliably.

## Data

- priority sources connected,
- data freshness visible,
- metric definitions trustworthy,
- data-health issues surfaced.

## User

- CMO/leader uses cockpit,
- marketing managers use Ask Marketing,
- customer engages with recommendations/approvals.

## Specialist

- specialist can configure a new use case without code changes to core platform,
- specialist can reuse existing skills across customers.

## Product

- pilot-specific functionality extracted into reusable configuration/templates.

---

# 49. Phased Product Roadmap

## Phase 0 — Commercial & Discovery

Build:

- public lead form,
- internal CRM-like lead workflow,
- Success Manager workspace,
- customer provisioning,
- customer invitation.

## Phase 1 — Connected Cockpit

Build:

- connectors,
- data ingestion,
- semantic metrics,
- data health,
- cockpit,
- customer authentication.

## Phase 2 — Ask & Intelligence

Build:

- model gateway,
- Ask Marketing,
- insights,
- recommendations,
- automated reporting.

## Phase 3 — Specialist Configuration

Build:

- specialist console,
- skill registry,
- prompts,
- customer context,
- brand profiles,
- workflow builder/configuration.

## Phase 4 — Automation & Execution

Build:

- action connectors,
- approvals,
- automations,
- tool execution,
- task creation,
- outcome tracking.

## Phase 5 — Expansion Modules

Build:

- Brand Studio,
- CRM/retention,
- lead engine,
- SEO,
- CRO,
- market intelligence,
- tracking/governance.

---

# 50. Recommended Repository Structure

```text
/apps
  /web
  /api
  /worker
  /specialist-console

/packages
  /ui
  /types
  /connector-sdk
  /agent-sdk
  /skill-sdk
  /workflow-sdk
  /policy-sdk
  /model-sdk
  /metrics-sdk
  /evaluation-sdk

/modules
  /lead-intake
  /onboarding
  /cockpit
  /performance
  /organic
  /cro
  /brand-studio
  /lifecycle
  /leads
  /market-intelligence
  /tracking
  /governance
  /ask-marketing

/connectors
  /google-analytics
  /google-ads
  /meta
  /linkedin
  /tiktok
  /salesforce
  /hubspot
  /asana
  /jira
  /linear
  /notion
  /generic-rest
  /mcp
  /comfyui

/skills
  /performance
  /lead-intelligence
  /crm
  /creative
  /seo
  /market-intelligence
  /tracking
  /reporting

/agents
  /cmO-intelligence
  /performance
  /creative
  /lead
  /lifecycle
  /seo
  /market
  /tracking

/workflows
  /weekly-performance-review
  /monthly-cmo-review
  /creative-production
  /lead-intelligence
  /tracking-monitor

/db
  /migrations
  /seed

/docs
  /architecture
  /connectors
  /skills
  /agents
  /workflows
  /security
  /product
```

Logical boundaries are mandatory even if implementation details change.

---

# 51. Engineering Principles for Cursor

## Principle 1 — Configuration over hard-coding

Customer-specific logic must live in configuration where possible.

## Principle 2 — Provider abstraction

Never couple business logic to one AI provider or one marketing platform.

## Principle 3 — Evidence-first AI

Insights must link to source data.

## Principle 4 — Human control

High-risk actions require approval.

## Principle 5 — Reusability

A solution built for one customer must be evaluated for extraction into a reusable skill/workflow/template.

## Principle 6 — Tenant safety

Never share customer context across tenants.

## Principle 7 — Observability

Every production run is traceable.

## Principle 8 — Small modules

Prefer composable modules over a giant application service.

---

# 52. Cursor Master Prompt

Use this as the initial master instruction in Cursor.

```text
You are the principal engineer building an enterprise-grade AI Marketing Operating System.

The product is NOT a generic AI chatbot, NOT a sales platform, NOT a customer service platform, and NOT a self-service agent marketplace.

It is a marketing-only operating system delivered through a managed service model.

CUSTOMER JOURNEY
1. Prospect submits a public lead form.
2. Success Manager performs discovery.
3. Qualified customer receives credentials.
4. Customer connects marketing tools.
5. Platform creates a unified Marketing Cockpit.
6. Customer can ask questions about its own data using a configurable LLM/model provider.
7. Internal AI Marketing Specialist accesses the customer workspace.
8. Specialist configures customer-specific context, brand rules, skills, prompts, agents, workflows and automations.
9. Approved automations execute actions in the customer's existing marketing tools.
10. Outcomes are measured and the system is continuously improved.

CORE PRODUCT IDEA
CONNECT → UNDERSTAND → DISPLAY → ASK → DESIGN → AUTOMATE → EXECUTE → MEASURE → IMPROVE

PRODUCT SURFACES
- Customer Portal
- Internal Specialist Console
- Platform Administration

CORE MODULES
- Lead Intake
- Customer Provisioning
- Integrations
- Data Health
- Marketing Cockpit
- Ask Marketing
- Customer Context
- Brand Profile
- Skills
- Agents
- Prompts
- Workflows
- Automations
- Approvals
- Policies
- Evaluations
- Outcomes
- Audit

ARCHITECTURE
Use:
- Next.js
- React
- TypeScript
- Tailwind
- FastAPI
- Python 3.12+
- Pydantic
- SQLAlchemy
- PostgreSQL
- pgvector
- Redis
- S3-compatible object storage

Use clean domain boundaries and an internal provider abstraction for models and integrations.

AI PROVIDERS
Create a ModelGateway abstraction. Initially support OpenAI and Anthropic adapters, but never import provider SDKs into business-domain logic.

INTEGRATIONS
Create a Connector SDK. Connectors must provide authentication, resource discovery, schemas, metric queries, health checks and typed actions.

INITIAL CONNECTORS
- GA4
- Google Ads
- Meta
- Salesforce or HubSpot
- Asana/Jira/Linear
- Notion
- Generic REST/API
- MCP

MULTI-TENANCY
All customer data is tenant-scoped.
Users can belong to multiple tenants.
Never leak data through prompts, embeddings, logs, caches or evaluations.

AGENTS
Agents combine:
- goal
- context
- skills
- knowledge
- tools
- model
- memory
- policies
- evaluations

SKILLS
Skills are reusable marketing capabilities. Customer-specific skills must be versioned and configurable.

WORKFLOWS
Workflows are durable, observable, resumable and versioned. Do not put customer-specific workflow logic directly into application code.

POLICY
Every external write/action must have a defined permission, risk classification and approval requirement.
Default autonomy is OBSERVE.

ASK MARKETING
Natural-language questions about connected customer data must show evidence, source, date range, freshness and relevant assumptions.

COCKPIT
The cockpit is the primary customer dashboard. It should be pre-configured from standard modules but populated with customer-specific metrics and priorities.

SPECIALIST CONSOLE
Build the specialist console early. It is core product infrastructure because customer-specific marketing systems are configured there.

PRODUCTIZATION RULE
For every customer implementation, ask:
Can this become a reusable skill, workflow, connector capability, template or module?
If yes, extract it.

ENGINEERING RULES
- configuration over hard-coding
- typed interfaces
- provider abstractions
- tenant isolation
- audit everything important
- deterministic tool contracts
- tests for core business logic
- evaluations for AI behavior
- feature flags for incomplete functionality
- graceful error handling
- no silent data transformations

MVP PRIORITY
1. Lead intake + provisioning
2. Integrations
3. Data model + data health
4. Marketing Cockpit
5. Ask Marketing
6. Specialist Console
7. Skills
8. Basic workflows/automations
9. Approvals
10. Audit

Do not build every module before validating the first pilot.

When implementing a feature:
1. inspect the repository
2. identify existing abstractions
3. reuse existing components
4. preserve boundaries
5. write/update types
6. write tests
7. implement
8. run tests
9. verify tenant isolation
10. document the change

Before creating a new abstraction, search the codebase for an existing one.
Do not duplicate connector, model, policy, workflow or tenant logic.
```

---

# 53. First Development Sprint

Goal:

**Create the skeleton of the real commercial-to-customer journey.**

Implement:

1. Public lead form.
2. Lead persistence.
3. Internal lead list.
4. Success Manager notes.
5. Convert lead → customer.
6. Customer invitation.
7. Customer login.
8. Tenant/workspace isolation.
9. Integrations page.
10. First mock connector.
11. Empty Cockpit shell.
12. Specialist Console shell.

Do NOT start with autonomous agents.

---

# 54. Second Development Sprint

Goal:

**Connect real data and populate the cockpit.**

Implement:

- first real connectors,
- OAuth,
- source selection,
- sync job,
- normalized metrics,
- data-health status,
- KPI configuration,
- cockpit widgets,
- source/freshness display.

---

# 55. Third Development Sprint

Goal:

**Make the data conversational.**

Implement:

- ModelGateway,
- Ask Marketing UI,
- intent planning,
- read-only tool calls,
- evidence display,
- source citations within product UI,
- conversation history,
- cost tracking,
- model selection configuration.

---

# 56. Fourth Development Sprint

Goal:

**Make the product configurable by AI marketing specialists.**

Implement:

- Customer Context,
- Brand Profile,
- Prompt Templates,
- Skill Registry,
- basic Agent configuration,
- Tool permissions,
- Workflow configuration,
- test run UI,
- versioning.

---

# 57. Fifth Development Sprint

Goal:

**Turn insights into managed work.**

Implement:

- Recommendations,
- Approvals,
- Actions,
- one real write-capable connector,
- Automation triggers,
- Workflow runs,
- Outcome tracking,
- Audit.

---

# 58. Productized Customer Configuration

Every customer configuration should have:

```text
/customer-configs/<tenant>/
  business.yaml
  metrics.yaml
  brand.yaml
  prompts/
  skills/
  agents/
  workflows/
  automations/
  policies/
```

Do not require application-code deployment for ordinary customer configuration.

Where tenant-specific code is genuinely required, isolate it behind a supported extension mechanism.

---

# 59. Definition of Done for Every Module

A module is complete only when:

1. UI exists.
2. API exists.
3. Data model exists.
4. Tenant isolation is tested.
5. RBAC is enforced.
6. Error handling exists.
7. Observability exists.
8. Audit events exist when applicable.
9. Feature flag exists if rollout is incomplete.
10. Tests exist.
11. Documentation exists.
12. Customer-specific configuration does not require core-code changes unless explicitly justified.

For AI modules additionally require:

13. Evaluation suite.
14. Prompt versioning.
15. Model abstraction.
16. Evidence/grounding behavior.
17. Cost/latency observability.

---

# 60. Final Product Test

The product is progressing correctly when a new customer can follow this path:

```text
Lead submitted
  ↓
Success Manager understands problem
  ↓
Customer provisioned
  ↓
Customer connects stack
  ↓
Data syncs
  ↓
Cockpit appears
  ↓
Customer asks a question
  ↓
Answer is grounded in customer data
  ↓
Specialist configures a skill
  ↓
Specialist creates a workflow
  ↓
Workflow is evaluated
  ↓
Customer approves
  ↓
Action executes in existing marketing stack
  ↓
Outcome is measured
  ↓
Specialist improves the configuration
```

This complete journey is more important than having a large number of features.

---

# 61. North-Star Product Principle

The product should progressively move the customer from:

**Fragmented tools + agencies + spreadsheets + manual coordination**

toward:

**Connected data + one cockpit + specialized AI + automated workflows + human governance.**

The cockpit is the starting point.

The managed, configurable AI marketing system is the end product.
