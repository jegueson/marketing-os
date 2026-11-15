-- Single-use OAuth state (ADR-0009). The callback learns the tenant from the state
-- value itself, so the policy also matches app.oauth_state for that one request.

create table public.oauth_states (
  state text primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  connection_id uuid not null references public.connections (id) on delete cascade,
  connector_slug text not null,
  code_verifier text not null,
  redirect_uri text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_oauth_states_tenant on public.oauth_states (tenant_id);

alter table public.oauth_states enable row level security;
alter table public.oauth_states force row level security;
revoke all on table public.oauth_states from anon, authenticated;
grant select, insert, update, delete on table public.oauth_states to app_api;

create policy oauth_states_access on public.oauth_states
  for all to app_api
  using (
    tenant_id = app.current_tenant_id()
    or state = nullif(current_setting('app.oauth_state', true), '')
  )
  with check (
    tenant_id = app.current_tenant_id()
    or state = nullif(current_setting('app.oauth_state', true), '')
  );
