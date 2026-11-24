-- Sprint 4 skills and agents. Same draft-plus-version columns as profiles.
-- A workspace holds many skills and many agents. The name stays in the draft.
-- Must stay aligned with packages/db/src/schema/config.ts.

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  status text not null default 'draft',
  draft jsonb not null default '{}'::jsonb,
  active_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint skills_status_check check (status in ('draft', 'published')),
  constraint skills_published_version_check check (status <> 'published' or active_version is not null),
  constraint skills_version_positive_check check (active_version is null or active_version > 0),
  constraint skills_draft_object_check check (jsonb_typeof(draft) = 'object')
);

create index idx_skills_tenant_workspace on public.skills (tenant_id, workspace_id);

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  status text not null default 'draft',
  draft jsonb not null default '{}'::jsonb,
  active_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agents_status_check check (status in ('draft', 'published')),
  constraint agents_published_version_check check (status <> 'published' or active_version is not null),
  constraint agents_version_positive_check check (active_version is null or active_version > 0),
  constraint agents_draft_object_check check (jsonb_typeof(draft) = 'object')
);

create index idx_agents_tenant_workspace on public.agents (tenant_id, workspace_id);

alter table public.skills enable row level security;
alter table public.skills force row level security;
alter table public.agents enable row level security;
alter table public.agents force row level security;

revoke all on table public.skills from anon, authenticated;
revoke all on table public.agents from anon, authenticated;

grant select, insert, update, delete on table public.skills to app_api;
grant select, insert, update, delete on table public.agents to app_api;

create policy skills_tenant_isolation on public.skills
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy agents_tenant_isolation on public.agents
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop trigger if exists skills_workspace_tenant on public.skills;
create trigger skills_workspace_tenant
  before insert or update on public.skills
  for each row execute function app.enforce_workspace_tenant();

drop trigger if exists agents_workspace_tenant on public.agents;
create trigger agents_workspace_tenant
  before insert or update on public.agents
  for each row execute function app.enforce_workspace_tenant();

alter table public.config_versions drop constraint config_versions_resource_type_check;
alter table public.config_versions add constraint config_versions_resource_type_check
  check (resource_type in ('business_profile', 'brand_profile', 'skill', 'agent'));
