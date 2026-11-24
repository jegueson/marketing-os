-- Sprint 4 workflow test runs. Stores step status and outputs only.
-- Prompt bodies and model payloads stay out of this table (ADR-0026).
-- Must stay aligned with packages/db/src/schema/workflow-runs.ts.

create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  workflow_version integer not null,
  trigger text not null,
  status text not null,
  error_code text,
  steps jsonb not null default '[]'::jsonb,
  report jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_runs_trigger_check check (trigger in ('manual', 'schedule')),
  constraint workflow_runs_status_check check (
    status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')
  ),
  constraint workflow_runs_version_positive_check check (workflow_version > 0),
  constraint workflow_runs_steps_array_check check (jsonb_typeof(steps) = 'array'),
  constraint workflow_runs_report_object_check check (
    report is null or jsonb_typeof(report) = 'object'
  )
);

create index idx_workflow_runs_tenant_workspace on public.workflow_runs (tenant_id, workspace_id, created_at desc);
create index idx_workflow_runs_workflow on public.workflow_runs (tenant_id, workflow_id, created_at desc);

alter table public.workflow_runs enable row level security;
alter table public.workflow_runs force row level security;

revoke all on table public.workflow_runs from anon, authenticated;
grant select, insert, update, delete on table public.workflow_runs to app_api;

create policy workflow_runs_tenant_isolation on public.workflow_runs
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop trigger if exists workflow_runs_workspace_tenant on public.workflow_runs;
create trigger workflow_runs_workspace_tenant
  before insert or update on public.workflow_runs
  for each row execute function app.enforce_workspace_tenant();
