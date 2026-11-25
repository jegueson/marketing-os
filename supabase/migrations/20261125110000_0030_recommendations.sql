-- Sprint 5 recommendation rows (PRD section 23).
-- Evidence is stored text. There is no prompt column.
-- Must stay aligned with packages/db/src/schema/recommendations.ts.

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  problem text not null,
  evidence text not null,
  proposed_action text not null,
  expected_impact text not null,
  confidence text not null,
  effort text not null,
  approval_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recommendations_problem_check check (char_length(trim(problem)) between 1 and 2000),
  constraint recommendations_evidence_check check (char_length(trim(evidence)) between 1 and 4000),
  constraint recommendations_proposed_action_check check (char_length(trim(proposed_action)) between 1 and 2000),
  constraint recommendations_expected_impact_check check (char_length(trim(expected_impact)) between 1 and 2000),
  constraint recommendations_confidence_check check (confidence in ('low', 'medium', 'high')),
  constraint recommendations_effort_check check (effort in ('low', 'medium', 'high')),
  constraint recommendations_approval_status_check check (
    approval_status is null
    or approval_status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')
  )
);

create index idx_recommendations_tenant_workspace
  on public.recommendations (tenant_id, workspace_id, created_at desc);

alter table public.recommendations enable row level security;
alter table public.recommendations force row level security;

revoke all on table public.recommendations from anon, authenticated;
grant select, insert, update on table public.recommendations to app_api;

create policy recommendations_tenant_isolation on public.recommendations
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop trigger if exists recommendations_workspace_tenant on public.recommendations;
create trigger recommendations_workspace_tenant
  before insert or update on public.recommendations
  for each row execute function app.enforce_workspace_tenant();
