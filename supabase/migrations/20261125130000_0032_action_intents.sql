-- Sprint 5 action intents. The idempotency key is required. Params are stored as a hash.
-- Must stay aligned with packages/db/src/schema/action-intents.ts.

create table public.action_intents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  connector text not null,
  tool text not null,
  params_hash text not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint action_intents_tenant_key unique (tenant_id, idempotency_key),
  constraint action_intents_connector_check check (
    char_length(connector) between 1 and 80
    and connector ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'
  ),
  constraint action_intents_tool_check check (
    char_length(tool) between 1 and 80
    and tool ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'
  ),
  constraint action_intents_params_hash_check check (params_hash ~ '^[a-f0-9]{64}$'),
  constraint action_intents_key_check check (
    char_length(idempotency_key) between 1 and 200
    and idempotency_key = trim(idempotency_key)
  )
);

alter table public.action_intents enable row level security;
alter table public.action_intents force row level security;

revoke all on table public.action_intents from anon, authenticated;
grant select, insert on table public.action_intents to app_api;
revoke update, delete on table public.action_intents from app_api;

create policy action_intents_tenant_isolation on public.action_intents
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop trigger if exists action_intents_workspace_tenant on public.action_intents;
create trigger action_intents_workspace_tenant
  before insert or update on public.action_intents
  for each row execute function app.enforce_workspace_tenant();

create or replace function app.action_intents_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'action intents are immutable';
end;
$$;

drop trigger if exists action_intents_no_update on public.action_intents;
create trigger action_intents_no_update
  before update or delete on public.action_intents
  for each row execute function app.action_intents_immutable();
