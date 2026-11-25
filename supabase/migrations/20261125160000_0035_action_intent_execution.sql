-- Sprint 5 execution. An intent may move from awaiting_approval to executed or failed once.
-- The key, params hash, and approval stay immutable. Must stay aligned with
-- packages/db/src/schema/action-intents.ts.

alter table public.action_intents
  add column external_id text;

alter table public.action_intents drop constraint action_intents_status_check;
alter table public.action_intents
  add constraint action_intents_status_check
  check (status in ('awaiting_approval', 'executed', 'failed'));

alter table public.action_intents
  add constraint action_intents_external_id_check
  check (
    (
      status = 'executed'
      and external_id is not null
      and char_length(external_id) between 1 and 200
    )
    or (status <> 'executed' and external_id is null)
  );

grant update on table public.action_intents to app_api;

create or replace function app.action_intents_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'action intents are immutable';
  end if;
  if new.id is distinct from old.id
     or new.tenant_id is distinct from old.tenant_id
     or new.workspace_id is distinct from old.workspace_id
     or new.connector is distinct from old.connector
     or new.tool is distinct from old.tool
     or new.params_hash is distinct from old.params_hash
     or new.idempotency_key is distinct from old.idempotency_key
     or new.approval_id is distinct from old.approval_id
     or new.created_at is distinct from old.created_at
  then
    raise exception 'action intents are immutable';
  end if;
  if old.status <> 'awaiting_approval' then
    raise exception 'action intent execution is immutable';
  end if;
  if new.status = 'executed' and new.external_id is not null then
    if not exists (
      select 1
      from public.approvals
      where id = new.approval_id
        and tenant_id = new.tenant_id
        and workspace_id = new.workspace_id
        and status = 'approved'
        and expires_at > now()
    ) then
      raise exception 'action intent requires an unexpired approval';
    end if;
    return new;
  end if;
  if new.status = 'failed' and new.external_id is null then
    if not exists (
      select 1
      from public.approvals
      where id = new.approval_id
        and tenant_id = new.tenant_id
        and workspace_id = new.workspace_id
        and status = 'approved'
        and expires_at > now()
    ) then
      raise exception 'action intent requires an unexpired approval';
    end if;
    return new;
  end if;
  raise exception 'invalid action intent transition';
end;
$$;
