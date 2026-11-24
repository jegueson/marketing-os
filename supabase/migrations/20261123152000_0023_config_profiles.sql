-- Sprint 4 business and brand profiles, plus the append-only version log.
-- Later tasks widen config_versions.resource_type for skills, agents, and workflows.
-- Must stay aligned with packages/db/src/schema/config.ts.

create table public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  status text not null default 'draft',
  draft jsonb not null default '{}'::jsonb,
  active_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_profiles_tenant_workspace unique (tenant_id, workspace_id),
  constraint business_profiles_status_check check (status in ('draft', 'published')),
  constraint business_profiles_published_version_check check (status <> 'published' or active_version is not null),
  constraint business_profiles_version_positive_check check (active_version is null or active_version > 0),
  constraint business_profiles_draft_object_check check (jsonb_typeof(draft) = 'object')
);

create table public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  status text not null default 'draft',
  draft jsonb not null default '{}'::jsonb,
  active_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_profiles_tenant_workspace unique (tenant_id, workspace_id),
  constraint brand_profiles_status_check check (status in ('draft', 'published')),
  constraint brand_profiles_published_version_check check (status <> 'published' or active_version is not null),
  constraint brand_profiles_version_positive_check check (active_version is null or active_version > 0),
  constraint brand_profiles_draft_object_check check (jsonb_typeof(draft) = 'object')
);

create table public.config_versions (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  resource_type text not null,
  resource_id uuid not null,
  version integer not null,
  document jsonb not null,
  published_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint config_versions_resource_version unique (tenant_id, resource_type, resource_id, version),
  constraint config_versions_resource_type_check check (resource_type in ('business_profile', 'brand_profile')),
  constraint config_versions_version_positive_check check (version > 0),
  constraint config_versions_document_object_check check (jsonb_typeof(document) = 'object')
);

create index idx_config_versions_tenant_created on public.config_versions (tenant_id, created_at desc);

alter table public.business_profiles enable row level security;
alter table public.business_profiles force row level security;
alter table public.brand_profiles enable row level security;
alter table public.brand_profiles force row level security;
alter table public.config_versions enable row level security;
alter table public.config_versions force row level security;

revoke all on table public.business_profiles from anon, authenticated;
revoke all on table public.brand_profiles from anon, authenticated;
revoke all on table public.config_versions from anon, authenticated;

grant select, insert, update, delete on table public.business_profiles to app_api;
grant select, insert, update, delete on table public.brand_profiles to app_api;
grant select, insert on table public.config_versions to app_api;

create policy business_profiles_tenant_isolation on public.business_profiles
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy brand_profiles_tenant_isolation on public.brand_profiles
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy config_versions_tenant on public.config_versions
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- The workspace row must belong to the same tenant. RLS would hide a foreign workspace,
-- so a missing match is the same failure as a real mismatch.
create or replace function app.enforce_workspace_tenant()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
    from public.workspaces
    where id = new.workspace_id
      and tenant_id = new.tenant_id
  ) then
    raise exception 'workspace does not belong to tenant';
  end if;
  return new;
end;
$$;

drop trigger if exists business_profiles_workspace_tenant on public.business_profiles;
create trigger business_profiles_workspace_tenant
  before insert or update on public.business_profiles
  for each row execute function app.enforce_workspace_tenant();

drop trigger if exists brand_profiles_workspace_tenant on public.brand_profiles;
create trigger brand_profiles_workspace_tenant
  before insert or update on public.brand_profiles
  for each row execute function app.enforce_workspace_tenant();

drop trigger if exists config_versions_workspace_tenant on public.config_versions;
create trigger config_versions_workspace_tenant
  before insert or update on public.config_versions
  for each row execute function app.enforce_workspace_tenant();

create or replace function app.prevent_config_version_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'config_versions are immutable';
end;
$$;

drop trigger if exists config_versions_immutable on public.config_versions;
create trigger config_versions_immutable
  before update or delete on public.config_versions
  for each row execute function app.prevent_config_version_mutation();
