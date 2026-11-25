-- Sprint 4 knowledge sources, documents, and append-only vector chunks (ADR-0026 §8).
-- Must stay aligned with packages/db/src/schema/knowledge.ts.

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  kind text not null,
  locator text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_sources_tenant_workspace_name unique (tenant_id, workspace_id, name),
  constraint knowledge_sources_kind_check check (kind in ('notion', 'r2_upload'))
);

create index idx_knowledge_sources_tenant_workspace
  on public.knowledge_sources (tenant_id, workspace_id);

create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  source_id uuid not null references public.knowledge_sources (id) on delete cascade,
  title text not null,
  object_key text not null,
  created_at timestamptz not null default now(),
  constraint knowledge_documents_tenant_object_key unique (tenant_id, object_key)
);

create index idx_knowledge_documents_tenant_source
  on public.knowledge_documents (tenant_id, source_id, created_at desc);

create table public.knowledge_chunks (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  source_id uuid not null references public.knowledge_sources (id) on delete cascade,
  document_id uuid not null references public.knowledge_documents (id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now(),
  constraint knowledge_chunks_document_index unique (document_id, chunk_index),
  constraint knowledge_chunks_index_nonneg_check check (chunk_index >= 0)
);

create index idx_knowledge_chunks_tenant_source
  on public.knowledge_chunks (tenant_id, source_id);

alter table public.knowledge_sources enable row level security;
alter table public.knowledge_sources force row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_documents force row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.knowledge_chunks force row level security;

revoke all on table public.knowledge_sources from anon, authenticated;
revoke all on table public.knowledge_documents from anon, authenticated;
revoke all on table public.knowledge_chunks from anon, authenticated;

grant select, insert, update, delete on table public.knowledge_sources to app_api;
grant select, insert, update, delete on table public.knowledge_documents to app_api;
grant select, insert on table public.knowledge_chunks to app_api;
revoke update, delete on table public.knowledge_chunks from app_api;

create policy knowledge_sources_tenant_isolation on public.knowledge_sources
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy knowledge_documents_tenant_isolation on public.knowledge_documents
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy knowledge_chunks_tenant_isolation on public.knowledge_chunks
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop trigger if exists knowledge_sources_workspace_tenant on public.knowledge_sources;
create trigger knowledge_sources_workspace_tenant
  before insert or update on public.knowledge_sources
  for each row execute function app.enforce_workspace_tenant();

drop trigger if exists knowledge_documents_workspace_tenant on public.knowledge_documents;
create trigger knowledge_documents_workspace_tenant
  before insert or update on public.knowledge_documents
  for each row execute function app.enforce_workspace_tenant();

drop trigger if exists knowledge_chunks_workspace_tenant on public.knowledge_chunks;
create trigger knowledge_chunks_workspace_tenant
  before insert or update on public.knowledge_chunks
  for each row execute function app.enforce_workspace_tenant();

create or replace function app.prevent_knowledge_chunk_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'knowledge_chunks are immutable';
end;
$$;

drop trigger if exists knowledge_chunks_immutable on public.knowledge_chunks;
create trigger knowledge_chunks_immutable
  before update or delete on public.knowledge_chunks
  for each row execute function app.prevent_knowledge_chunk_mutation();
