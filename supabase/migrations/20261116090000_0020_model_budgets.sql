-- Optional monthly model budget (ADR-0025). One cap per tenant.
-- Parallel requests may overshoot; this table does not serialize them.
-- Payment and credit balances stay out of this repository.

create table public.model_budgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  monthly_cap_micro_usd bigint,
  enforcement text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint model_budgets_tenant_unique unique (tenant_id),
  constraint model_budgets_enforcement_check check (enforcement in ('hard', 'warn')),
  constraint model_budgets_cap_check check (monthly_cap_micro_usd is null or monthly_cap_micro_usd >= 0)
);

create index idx_model_budgets_tenant on public.model_budgets (tenant_id);

alter table public.model_budgets enable row level security;
alter table public.model_budgets force row level security;

revoke all on table public.model_budgets from anon, authenticated;
grant select, insert, update, delete on table public.model_budgets to app_api;

create policy model_budgets_tenant on public.model_budgets
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
