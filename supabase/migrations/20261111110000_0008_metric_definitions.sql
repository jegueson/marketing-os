-- Sprint 2 metric semantic layer (ADR-0010). Platform definitions have a null tenant_id.
-- metric_values are numeric, never float, and require a definition version.

create table public.metric_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  key text not null,
  source text not null,
  version text not null,
  label text not null,
  unit text,
  formula jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint metric_definitions_formula_op check (
    formula is null or formula->>'op' in ('sum', 'ratio', 'filter')
  )
);

create unique index metric_definitions_platform_key
  on public.metric_definitions (key)
  where tenant_id is null;

create unique index metric_definitions_tenant_key
  on public.metric_definitions (tenant_id, key)
  where tenant_id is not null;

create index idx_metric_definitions_tenant on public.metric_definitions (tenant_id);

create table public.metric_values (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  definition_key text not null,
  definition_version text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  dimension_hash text not null,
  connection_id uuid references public.connections (id) on delete set null,
  value numeric(20, 6) not null,
  fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint metric_values_lineage unique (
    tenant_id, definition_key, definition_version, period_start, period_end, dimension_hash
  ),
  constraint metric_values_version_present check (length(definition_version) > 0)
);

create index idx_metric_values_tenant on public.metric_values (tenant_id, definition_key);

alter table public.metric_definitions enable row level security;
alter table public.metric_definitions force row level security;
alter table public.metric_values enable row level security;
alter table public.metric_values force row level security;

revoke all on table public.metric_definitions from anon, authenticated;
revoke all on table public.metric_values from anon, authenticated;
grant select, insert, update, delete on table public.metric_definitions to app_api;
grant select, insert, update, delete on table public.metric_values to app_api;

create policy metric_definitions_read on public.metric_definitions
  for select to app_api
  using (tenant_id is null or tenant_id = app.current_tenant_id() or app.is_staff());

create policy metric_definitions_insert on public.metric_definitions
  for insert to app_api
  with check (tenant_id = app.current_tenant_id() and tenant_id is not null);

create policy metric_definitions_update on public.metric_definitions
  for update to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy metric_definitions_delete on public.metric_definitions
  for delete to app_api
  using (tenant_id = app.current_tenant_id());

create policy metric_values_tenant_isolation on public.metric_values
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
