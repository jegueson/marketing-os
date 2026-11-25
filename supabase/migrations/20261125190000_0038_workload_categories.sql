-- Stored workload hours (PRD section 22). The API returns these numbers.
-- There is no savings column. A savings figure must be stored before it can be shown.
-- Must stay aligned with packages/db/src/schema/workload.ts.

create table public.workload_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  category text not null,
  baseline_hours integer not null,
  hours_absorbed integer not null,
  created_at timestamptz not null default now(),
  constraint workload_categories_workspace_category unique (tenant_id, workspace_id, category),
  constraint workload_categories_category_check check (
    category in (
      'reporting',
      'media_optimization',
      'seo',
      'crm_operations',
      'creative_production',
      'research',
      'tracking_qa',
      'project_coordination'
    )
  ),
  constraint workload_categories_baseline_hours_check check (baseline_hours >= 0),
  constraint workload_categories_hours_absorbed_check check (hours_absorbed >= 0)
);

alter table public.workload_categories enable row level security;
alter table public.workload_categories force row level security;

revoke all on table public.workload_categories from anon, authenticated;
grant select, insert on table public.workload_categories to app_api;

create policy workload_categories_tenant_isolation on public.workload_categories
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop trigger if exists workload_categories_workspace_tenant on public.workload_categories;
create trigger workload_categories_workspace_tenant
  before insert or update on public.workload_categories
  for each row execute function app.enforce_workspace_tenant();
