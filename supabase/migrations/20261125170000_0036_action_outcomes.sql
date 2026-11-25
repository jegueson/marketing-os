-- Sprint 5 outcome of one successful action. A failed call inserts nothing.
-- Must stay aligned with packages/db/src/schema/action-outcomes.ts.

create table public.action_outcomes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  action_intent_id uuid not null unique references public.action_intents (id) on delete restrict,
  external_id text not null,
  recorded_at timestamptz not null,
  constraint action_outcomes_external_id_check check (char_length(external_id) between 1 and 200)
);

alter table public.action_outcomes enable row level security;
alter table public.action_outcomes force row level security;

revoke all on table public.action_outcomes from anon, authenticated;
grant select, insert on table public.action_outcomes to app_api;
revoke update, delete on table public.action_outcomes from app_api;

create policy action_outcomes_tenant_isolation on public.action_outcomes
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop trigger if exists action_outcomes_workspace_tenant on public.action_outcomes;
create trigger action_outcomes_workspace_tenant
  before insert or update on public.action_outcomes
  for each row execute function app.enforce_workspace_tenant();

create or replace function app.action_outcomes_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'action outcomes are immutable';
end;
$$;

drop trigger if exists action_outcomes_no_update on public.action_outcomes;
create trigger action_outcomes_no_update
  before update or delete on public.action_outcomes
  for each row execute function app.action_outcomes_immutable();
