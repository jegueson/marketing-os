-- Sprint 4 tenant prompts for the PromptSource adapter.
-- Names must match tenant/<slug>. Platform prompts stay in code (ADR-0026).
-- Must stay aligned with packages/db/src/schema/prompts.ts.

create table public.tenant_prompts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  version text not null,
  purpose text not null,
  system text not null,
  content_hash text not null,
  model jsonb not null,
  created_at timestamptz not null default now(),
  constraint tenant_prompts_name_version unique (tenant_id, workspace_id, name, version),
  constraint tenant_prompts_name_check check (name ~ '^tenant/[a-z][a-z0-9]*(-[a-z0-9]+)*$'),
  constraint tenant_prompts_version_check check (version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'),
  constraint tenant_prompts_purpose_check check (char_length(trim(purpose)) between 1 and 80),
  constraint tenant_prompts_system_check check (char_length(system) between 1 and 20000),
  constraint tenant_prompts_hash_check check (content_hash ~ '^[a-f0-9]{64}$'),
  constraint tenant_prompts_model_object_check check (jsonb_typeof(model) = 'object')
);

create index idx_tenant_prompts_tenant_workspace on public.tenant_prompts (tenant_id, workspace_id);

alter table public.tenant_prompts enable row level security;
alter table public.tenant_prompts force row level security;

revoke all on table public.tenant_prompts from anon, authenticated;
grant select, insert on table public.tenant_prompts to app_api;

create policy tenant_prompts_tenant_isolation on public.tenant_prompts
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop trigger if exists tenant_prompts_workspace_tenant on public.tenant_prompts;
create trigger tenant_prompts_workspace_tenant
  before insert or update on public.tenant_prompts
  for each row execute function app.enforce_workspace_tenant();

create or replace function app.prevent_tenant_prompt_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'tenant_prompts are immutable';
end;
$$;

drop trigger if exists tenant_prompts_immutable on public.tenant_prompts;
create trigger tenant_prompts_immutable
  before update or delete on public.tenant_prompts
  for each row execute function app.prevent_tenant_prompt_mutation();
