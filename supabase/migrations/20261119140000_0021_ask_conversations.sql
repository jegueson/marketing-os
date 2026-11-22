-- Ask threads are private to the user who owns them (ADR-0024 conversations).
-- Staff do not get a bypass. History stays readable only by that user.

create table public.ask_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ask_conversations_title_check check (length(trim(title)) > 0)
);

create index idx_ask_conversations_owner on public.ask_conversations (tenant_id, user_id, updated_at desc);

create table public.ask_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ask_conversations (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint ask_messages_role_check check (role in ('user', 'assistant'))
);

create index idx_ask_messages_conversation on public.ask_messages (conversation_id, created_at);

create table public.ask_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ask_conversations (id) on delete cascade,
  message_id uuid references public.ask_messages (id) on delete set null,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null,
  prompt_name text,
  prompt_version text,
  question_hash text not null,
  error_code text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint ask_runs_status_check check (status in ('running', 'succeeded', 'failed', 'aborted')),
  constraint ask_runs_question_hash_check check (length(trim(question_hash)) > 0)
);

create index idx_ask_runs_conversation on public.ask_runs (conversation_id, created_at desc);

alter table public.ask_conversations enable row level security;
alter table public.ask_conversations force row level security;
alter table public.ask_messages enable row level security;
alter table public.ask_messages force row level security;
alter table public.ask_runs enable row level security;
alter table public.ask_runs force row level security;

revoke all on table public.ask_conversations from anon, authenticated;
revoke all on table public.ask_messages from anon, authenticated;
revoke all on table public.ask_runs from anon, authenticated;

grant select, insert, update, delete on table public.ask_conversations to app_api;
grant select, insert, update, delete on table public.ask_messages to app_api;
grant select, insert, update, delete on table public.ask_runs to app_api;

create policy ask_conversations_owner on public.ask_conversations
  for all to app_api
  using (user_id = app.current_user_id() and tenant_id = app.current_tenant_id())
  with check (user_id = app.current_user_id() and tenant_id = app.current_tenant_id());

create policy ask_messages_owner on public.ask_messages
  for all to app_api
  using (user_id = app.current_user_id() and tenant_id = app.current_tenant_id())
  with check (user_id = app.current_user_id() and tenant_id = app.current_tenant_id());

create policy ask_runs_owner on public.ask_runs
  for all to app_api
  using (user_id = app.current_user_id() and tenant_id = app.current_tenant_id())
  with check (user_id = app.current_user_id() and tenant_id = app.current_tenant_id());
