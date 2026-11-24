-- Sprint 4 workflow definitions. Same draft-plus-version shape as skills.
-- A workspace holds many workflows. The name stays in the draft.
-- Must stay aligned with packages/db/src/schema/config.ts.

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  status text not null default 'draft',
  draft jsonb not null default '{}'::jsonb,
  active_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflows_status_check check (status in ('draft', 'published')),
  constraint workflows_published_version_check check (status <> 'published' or active_version is not null),
  constraint workflows_version_positive_check check (active_version is null or active_version > 0),
  constraint workflows_draft_object_check check (jsonb_typeof(draft) = 'object')
);

create index idx_workflows_tenant_workspace on public.workflows (tenant_id, workspace_id);

alter table public.workflows enable row level security;
alter table public.workflows force row level security;

revoke all on table public.workflows from anon, authenticated;
grant select, insert, update, delete on table public.workflows to app_api;

create policy workflows_tenant_isolation on public.workflows
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop trigger if exists workflows_workspace_tenant on public.workflows;
create trigger workflows_workspace_tenant
  before insert or update on public.workflows
  for each row execute function app.enforce_workspace_tenant();

alter table public.config_versions drop constraint config_versions_resource_type_check;
alter table public.config_versions add constraint config_versions_resource_type_check
  check (resource_type in ('business_profile', 'brand_profile', 'skill', 'agent', 'workflow'));
