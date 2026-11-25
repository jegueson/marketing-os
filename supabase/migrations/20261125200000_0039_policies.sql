-- A published policy is a versioned document. requireApproval stays true in the schema.
-- Must stay aligned with packages/db/src/schema/config.ts.

create table public.policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  status text not null default 'draft',
  draft jsonb not null default '{}'::jsonb,
  active_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint policies_status_check check (status in ('draft', 'published')),
  constraint policies_published_version_check check (status <> 'published' or active_version is not null),
  constraint policies_version_positive_check check (active_version is null or active_version > 0),
  constraint policies_draft_object_check check (jsonb_typeof(draft) = 'object')
);

create index idx_policies_tenant_workspace on public.policies (tenant_id, workspace_id);

alter table public.policies enable row level security;
alter table public.policies force row level security;

revoke all on table public.policies from anon, authenticated;
grant select, insert, update, delete on table public.policies to app_api;

create policy policies_tenant_isolation on public.policies
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop trigger if exists policies_workspace_tenant on public.policies;
create trigger policies_workspace_tenant
  before insert or update on public.policies
  for each row execute function app.enforce_workspace_tenant();

alter table public.config_versions drop constraint if exists config_versions_resource_type_check;
alter table public.config_versions add constraint config_versions_resource_type_check
  check (resource_type in ('business_profile', 'brand_profile', 'skill', 'agent', 'workflow', 'policy'));
