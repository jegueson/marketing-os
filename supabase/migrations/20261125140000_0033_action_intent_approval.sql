-- Gate action intents on a pending approval (Sprint 5 T05).
-- 0032 rows have no approval. This sprint has not shipped, so those rows are removed.

delete from public.action_intents where true;

alter table public.action_intents
  add column status text not null default 'awaiting_approval',
  add column approval_id uuid not null references public.approvals (id) on delete restrict,
  add constraint action_intents_status_check check (status = 'awaiting_approval');

create index idx_action_intents_approval on public.action_intents (approval_id);

-- The intent insert can see the approval row written in the same transaction.
create or replace function app.action_intent_requires_approval()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
    from public.approvals
    where id = new.approval_id
      and tenant_id = new.tenant_id
      and workspace_id = new.workspace_id
      and status = 'pending'
  ) then
    raise exception 'action intent requires a pending approval';
  end if;
  return new;
end;
$$;

drop trigger if exists action_intents_require_approval on public.action_intents;
create trigger action_intents_require_approval
  before insert on public.action_intents
  for each row execute function app.action_intent_requires_approval();
