CREATE TABLE IF NOT EXISTS public.connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text NOT NULL,
  auth_type text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  supported_scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  connector_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  version text NOT NULL DEFAULT '1.0.0',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connector_id uuid NOT NULL REFERENCES public.connectors(id),
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  last_healthy_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connections_status_check CHECK (status IN ('pending','active','error','disconnected','expired'))
);
CREATE INDEX IF NOT EXISTS idx_connections_tenant_id ON public.connections(tenant_id);

CREATE TABLE IF NOT EXISTS public.credential_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  ciphertext text NOT NULL,
  nonce text NOT NULL,
  key_version text NOT NULL,
  credential_type text NOT NULL,
  expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cred_refs_connection_id ON public.credential_references(connection_id);
CREATE INDEX IF NOT EXISTS idx_cred_refs_tenant_id ON public.credential_references(tenant_id);

CREATE TABLE IF NOT EXISTS public.data_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  resource_name text,
  is_active boolean NOT NULL DEFAULT true,
  approved_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT data_scopes_connection_resource UNIQUE (connection_id, resource_type, resource_id)
);
CREATE INDEX IF NOT EXISTS idx_data_scopes_tenant_id ON public.data_scopes(tenant_id);

CREATE TABLE IF NOT EXISTS public.data_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  data_scope_id uuid REFERENCES public.data_scopes(id),
  status text NOT NULL DEFAULT 'unknown',
  freshness_at timestamptz,
  schema_state text,
  record_count text,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT data_health_status_check CHECK (status IN ('healthy','stale','error','unknown'))
);
CREATE INDEX IF NOT EXISTS idx_data_health_tenant_id ON public.data_health(tenant_id);

CREATE TABLE IF NOT EXISTS public.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id),
  workspace_id uuid REFERENCES public.workspaces(id),
  actor_id uuid REFERENCES public.profiles(id),
  actor_role text,
  event_type text NOT NULL,
  resource_type text,
  resource_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_created ON public.audit_events(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON public.audit_events(event_type);
COMMENT ON COLUMN public.audit_events.ip_address IS 'PII: client IP';
COMMENT ON COLUMN public.audit_events.user_agent IS 'PII: user agent';

CREATE TABLE IF NOT EXISTS public.outbox_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id),
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts bigint NOT NULL DEFAULT 0,
  last_attempted_at timestamptz,
  delivered_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbox_events_status_check CHECK (status IN ('pending','processing','delivered','failed'))
);
CREATE INDEX IF NOT EXISTS idx_outbox_tenant_id ON public.outbox_events(tenant_id);

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  description text,
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feature_flag_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_flag_id uuid NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ff_overrides_flag_tenant UNIQUE (feature_flag_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_ff_overrides_tenant_id ON public.feature_flag_overrides(tenant_id);

INSERT INTO public.connectors (slug, name, description, category, auth_type, status, supported_scopes)
VALUES (
  'mock',
  'Mock Marketing Data',
  'Deterministic fixtures for local and staging journeys',
  'analytics',
  'none',
  'active',
  '["campaigns","leads"]'::jsonb
)
ON CONFLICT (slug) DO NOTHING;
