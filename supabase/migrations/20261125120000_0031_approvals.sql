-- Sprint 5 approval records (PRD section 32).
-- A decision stores reviewer, comment, and decided_at. Expiry stores none of those.
-- Must stay aligned with packages/db/src/schema/approvals.ts.

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete restrict,
  reviewer_id uuid references public.profiles (id) on delete restrict,
  action text not null,
  risk_level text not null,
  evidence text not null,
  expected_impact text not null,
  status text not null default 'pending',
  comment text,
  expires_at timestamptz not null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approvals_action_check check (char_length(trim(action)) between 1 and 2000),
  constraint approvals_evidence_check check (char_length(trim(evidence)) between 1 and 4000),
  constraint approvals_expected_impact_check check (char_length(trim(expected_impact)) between 1 and 2000),
  constraint approvals_risk_level_check check (risk_level in ('low', 'medium', 'high')),
  constraint approvals_status_check check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  constraint approvals_comment_check check (
    comment is null or char_length(trim(comment)) between 1 and 2000
  ),
  constraint approvals_decision_shape_check check (
    (
      status in ('pending', 'expired')
      and reviewer_id is null
      and comment is null
      and decided_at is null
    )
    or (
      status in ('approved', 'rejected', 'cancelled')
      and reviewer_id is not null
      and comment is not null
      and decided_at is not null
    )
  )
);

create index idx_approvals_tenant_status_expiry
  on public.approvals (tenant_id, status, expires_at);

alter table public.approvals enable row level security;
alter table public.approvals force row level security;

revoke all on table public.approvals from anon, authenticated;
grant select, insert, update on table public.approvals to app_api;

create policy approvals_tenant_isolation on public.approvals
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop trigger if exists approvals_workspace_tenant on public.approvals;
create trigger approvals_workspace_tenant
  before insert or update on public.approvals
  for each row execute function app.enforce_workspace_tenant();

-- A new row is pending. A recorded decision cannot be rewritten.
-- A past-due pending row cannot become approved, rejected, or cancelled.
create or replace function app.approvals_insert_pending()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.status <> 'pending'
     or new.reviewer_id is not null
     or new.comment is not null
     or new.decided_at is not null then
    raise exception 'approval must be inserted as pending';
  end if;
  return new;
end;
$$;

create or replace function app.protect_approval_decision()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status <> 'pending' then
    raise exception 'approval decision is immutable';
  end if;
  if new.status = 'expired' then
    if old.expires_at > now() then
      raise exception 'approval is not expired';
    end if;
    return new;
  end if;
  if new.status not in ('approved', 'rejected', 'cancelled') then
    raise exception 'invalid approval transition';
  end if;
  if old.expires_at <= now() then
    raise exception 'approval expired';
  end if;
  return new;
end;
$$;

drop trigger if exists approvals_insert_pending on public.approvals;
create trigger approvals_insert_pending
  before insert on public.approvals
  for each row execute function app.approvals_insert_pending();

drop trigger if exists approvals_decision_immutable on public.approvals;
create trigger approvals_decision_immutable
  before update on public.approvals
  for each row execute function app.protect_approval_decision();
