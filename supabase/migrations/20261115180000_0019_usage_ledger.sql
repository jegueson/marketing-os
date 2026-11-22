-- Append-only model usage ledger (ADR-0025). Never stores prompt/response text.

create table public.usage_ledger (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  run_id text,
  purpose text not null,
  provider text not null,
  model text not null,
  prompt_name text,
  prompt_version text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_micro_usd bigint,
  cost_basis text not null,
  latency_ms integer not null default 0,
  status text not null,
  error_code text,
  created_at timestamptz not null default now(),
  constraint usage_ledger_provider_check check (
    provider in ('openrouter', 'openai_compatible', 'openai', 'anthropic')
  ),
  constraint usage_ledger_cost_basis_check check (cost_basis in ('provider_list', 'unknown')),
  constraint usage_ledger_status_check check (status in ('ok', 'error', 'aborted')),
  constraint usage_ledger_tokens_check check (input_tokens >= 0 and output_tokens >= 0),
  constraint usage_ledger_latency_check check (latency_ms >= 0)
);

create index idx_usage_ledger_tenant_created on public.usage_ledger (tenant_id, created_at desc);

alter table public.usage_ledger enable row level security;
alter table public.usage_ledger force row level security;
revoke all on table public.usage_ledger from anon, authenticated;
grant select, insert on table public.usage_ledger to app_api;
-- Updates/deletes blocked by trigger; revoke so the role cannot even try.
revoke update, delete on table public.usage_ledger from app_api;

create policy usage_ledger_tenant on public.usage_ledger
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create or replace function app.prevent_usage_ledger_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'usage_ledger is immutable';
end;
$$;

drop trigger if exists usage_ledger_immutable on public.usage_ledger;
create trigger usage_ledger_immutable
  before update or delete on public.usage_ledger
  for each row execute function app.prevent_usage_ledger_mutation();
