-- Sync runs and cursors. The queue is mos-sync, separate from the outbox queue.

create table public.sync_runs (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  connection_id uuid not null references public.connections (id) on delete cascade,
  status text not null default 'queued',
  mode text not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  attempt integer not null default 0,
  error_code text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint sync_runs_status_check check (status in ('queued','running','succeeded','failed')),
  constraint sync_runs_mode_check check (mode in ('backfill','incremental'))
);

create index idx_sync_runs_connection on public.sync_runs (connection_id, created_at);

create table public.sync_cursors (
  connection_id uuid primary key references public.connections (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  cursor text not null,
  updated_at timestamptz not null default now()
);

alter table public.sync_runs enable row level security;
alter table public.sync_runs force row level security;
alter table public.sync_cursors enable row level security;
alter table public.sync_cursors force row level security;
revoke all on table public.sync_runs from anon, authenticated;
revoke all on table public.sync_cursors from anon, authenticated;
grant select, insert, update, delete on table public.sync_runs to app_api;
grant select, insert, update, delete on table public.sync_cursors to app_api;

create policy sync_runs_tenant on public.sync_runs
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy sync_cursors_tenant on public.sync_cursors
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create or replace function app.due_sync_connections()
returns table (
  id uuid,
  tenant_id uuid,
  workspace_id uuid,
  connector_slug text,
  cursor text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(current_setting('app.staff', true), '') is distinct from 'on' then
    raise exception 'due_sync_connections requires staff context';
  end if;
  return query
    select c.id, c.tenant_id, c.workspace_id, k.slug, s.cursor
    from public.connections c
    join public.connectors k on k.id = c.connector_id
    left join public.sync_cursors s on s.connection_id = c.id
    where c.deleted_at is null
      and exists (
        select 1 from public.data_scopes d
        where d.connection_id = c.id and d.is_active
      );
end;
$$;

revoke all on function app.due_sync_connections() from public;
grant execute on function app.due_sync_connections() to app_api;

grant usage, select on all sequences in schema public to app_api;
