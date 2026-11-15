-- Tenant BYOK model settings (ADR-0025). Config and ciphertext stay in separate
-- tables so `select * from tenant_model_config` never returns the sealed key.

create table public.tenant_model_config (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null,
  base_url text,
  default_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_model_config_tenant_unique unique (tenant_id),
  constraint tenant_model_config_provider_check check (
    provider in ('openrouter', 'openai_compatible', 'openai', 'anthropic')
  ),
  constraint tenant_model_config_base_url_check check (
    provider <> 'openai_compatible'
    or (base_url is not null and length(trim(base_url)) > 0)
  )
);

create index idx_tenant_model_config_tenant on public.tenant_model_config (tenant_id);

create table public.model_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  config_id uuid not null references public.tenant_model_config (id) on delete cascade,
  ciphertext text not null,
  nonce text not null,
  key_version text not null,
  fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint model_credentials_tenant_unique unique (tenant_id),
  constraint model_credentials_config_unique unique (config_id)
);

create index idx_model_credentials_tenant on public.model_credentials (tenant_id);

alter table public.tenant_model_config enable row level security;
alter table public.tenant_model_config force row level security;
alter table public.model_credentials enable row level security;
alter table public.model_credentials force row level security;

revoke all on table public.tenant_model_config from anon, authenticated;
revoke all on table public.model_credentials from anon, authenticated;
grant select, insert, update, delete on table public.tenant_model_config to app_api;
grant select, insert, update, delete on table public.model_credentials to app_api;

create policy tenant_model_config_tenant on public.tenant_model_config
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy model_credentials_tenant on public.model_credentials
  for all to app_api
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
