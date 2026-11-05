-- Sprint 1 hardening: append-only notes, tighter audit/outbox policies,
-- access-resolution functions, idempotent consumer receipts, RBAC and flag seeds.

-- Append-only guard shared by tables that must never change after insert.
CREATE OR REPLACE FUNCTION app.prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS success_manager_notes_append_only ON public.success_manager_notes;
CREATE TRIGGER success_manager_notes_append_only
  BEFORE UPDATE OR DELETE ON public.success_manager_notes
  FOR EACH ROW EXECUTE FUNCTION app.prevent_mutation();
REVOKE UPDATE, DELETE ON TABLE public.success_manager_notes FROM app_api;

-- Audit rows: a tenant context may only write its own tenant or platform rows.
DROP POLICY IF EXISTS audit_insert ON public.audit_events;
CREATE POLICY audit_insert ON public.audit_events
  FOR INSERT TO app_api
  WITH CHECK (app.is_staff() OR tenant_id IS NULL OR tenant_id = app.current_tenant_id());

-- Outbox: platform events (tenant_id IS NULL) can be written by anyone but read only by staff/system.
DROP POLICY IF EXISTS outbox_staff_or_tenant ON public.outbox_events;
DROP POLICY IF EXISTS outbox_read ON public.outbox_events;
DROP POLICY IF EXISTS outbox_insert ON public.outbox_events;
DROP POLICY IF EXISTS outbox_update ON public.outbox_events;
CREATE POLICY outbox_read ON public.outbox_events
  FOR SELECT TO app_api
  USING (app.is_staff() OR tenant_id = app.current_tenant_id());
CREATE POLICY outbox_insert ON public.outbox_events
  FOR INSERT TO app_api
  WITH CHECK (app.is_staff() OR tenant_id IS NULL OR tenant_id = app.current_tenant_id());
CREATE POLICY outbox_update ON public.outbox_events
  FOR UPDATE TO app_api
  USING (app.is_staff())
  WITH CHECK (app.is_staff());
REVOKE DELETE ON TABLE public.outbox_events FROM app_api;

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON public.outbox_events(id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_leads_email_lower_created ON public.leads(lower(email), created_at);
CREATE INDEX IF NOT EXISTS idx_invitations_pending ON public.invitations(tenant_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_connections_workspace_live ON public.connections(tenant_id, workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_staff_assignments_user_id ON public.staff_assignments(user_id);

-- Idempotent queue consumer: one receipt per (event, handler).
CREATE TABLE IF NOT EXISTS public.event_receipts (
  event_id bigint NOT NULL REFERENCES public.outbox_events(id),
  handler text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, handler)
);
ALTER TABLE public.event_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_receipts FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.event_receipts TO app_api;
DROP POLICY IF EXISTS event_receipts_system ON public.event_receipts;
CREATE POLICY event_receipts_system ON public.event_receipts
  FOR ALL TO app_api
  USING (app.is_staff())
  WITH CHECK (app.is_staff());

-- Access resolution. SECURITY DEFINER so the API can find which tenant a
-- workspace belongs to before a tenant context exists. Each function reads
-- the caller from app.user_id, never from an argument.
CREATE OR REPLACE FUNCTION app.workspace_access(p_workspace_id uuid)
RETURNS TABLE (tenant_id uuid, membership_role text, staff_role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT w.tenant_id,
         (SELECT m.role FROM public.tenant_memberships m
           WHERE m.tenant_id = w.tenant_id AND m.user_id = app.current_user_id() AND m.status = 'active'),
         (SELECT s.role FROM public.staff_assignments s
           WHERE s.tenant_id = w.tenant_id AND s.user_id = app.current_user_id())
  FROM public.workspaces w
  WHERE w.id = p_workspace_id;
$$;

CREATE OR REPLACE FUNCTION app.tenant_access(p_tenant_id uuid)
RETURNS TABLE (tenant_id uuid, membership_role text, staff_role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT t.id,
         (SELECT m.role FROM public.tenant_memberships m
           WHERE m.tenant_id = t.id AND m.user_id = app.current_user_id() AND m.status = 'active'),
         (SELECT s.role FROM public.staff_assignments s
           WHERE s.tenant_id = t.id AND s.user_id = app.current_user_id())
  FROM public.tenants t
  WHERE t.id = p_tenant_id;
$$;

CREATE OR REPLACE FUNCTION app.my_memberships()
RETURNS TABLE (tenant_id uuid, tenant_name text, role text, workspace_id uuid, workspace_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT m.tenant_id, t.name, m.role, w.id, w.name
  FROM public.tenant_memberships m
  JOIN public.tenants t ON t.id = m.tenant_id
  JOIN public.workspaces w ON w.tenant_id = m.tenant_id AND w.status = 'active'
  WHERE m.user_id = app.current_user_id() AND m.status = 'active'
  ORDER BY t.name, w.name;
$$;

CREATE OR REPLACE FUNCTION app.my_staff_assignments()
RETURNS TABLE (tenant_id uuid, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT s.tenant_id, s.role
  FROM public.staff_assignments s
  WHERE s.user_id = app.current_user_id();
$$;

CREATE OR REPLACE FUNCTION app.invitation_by_token_hash(p_token_hash text)
RETURNS TABLE (id uuid, tenant_id uuid, email text, role text, status text, expires_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT i.id, i.tenant_id, i.email, i.role, i.status, i.expires_at
  FROM public.invitations i
  WHERE i.token_hash = p_token_hash;
$$;

REVOKE ALL ON FUNCTION app.workspace_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.tenant_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.my_memberships() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.my_staff_assignments() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.invitation_by_token_hash(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.workspace_access(uuid) TO app_api;
GRANT EXECUTE ON FUNCTION app.tenant_access(uuid) TO app_api;
GRANT EXECUTE ON FUNCTION app.my_memberships() TO app_api;
GRANT EXECUTE ON FUNCTION app.my_staff_assignments() TO app_api;
GRANT EXECUTE ON FUNCTION app.invitation_by_token_hash(text) TO app_api;

-- RBAC seed. Must match packages/core/src/rbac.ts (checked by packages/db tests).
INSERT INTO public.permissions (name) VALUES
  ('leads:read'), ('leads:write'), ('leads:convert'),
  ('tenants:provision'), ('tenants:read'),
  ('integrations:manage'), ('integrations:read'),
  ('cockpit:view'), ('audit:read'), ('onboarding:manage'),
  ('users:invite'), ('approvals:decide')
ON CONFLICT (name) DO NOTHING;

DELETE FROM public.role_permissions;
INSERT INTO public.role_permissions (role, permission_id)
SELECT r.role, p.id
FROM (VALUES
  ('platform_admin', 'leads:read'), ('platform_admin', 'leads:write'), ('platform_admin', 'leads:convert'),
  ('platform_admin', 'tenants:provision'), ('platform_admin', 'tenants:read'),
  ('platform_admin', 'integrations:manage'), ('platform_admin', 'integrations:read'),
  ('platform_admin', 'cockpit:view'), ('platform_admin', 'audit:read'), ('platform_admin', 'onboarding:manage'),
  ('platform_admin', 'users:invite'), ('platform_admin', 'approvals:decide'),
  ('success_manager', 'leads:read'), ('success_manager', 'leads:write'), ('success_manager', 'leads:convert'),
  ('success_manager', 'tenants:provision'), ('success_manager', 'tenants:read'),
  ('success_manager', 'integrations:read'), ('success_manager', 'integrations:manage'),
  ('success_manager', 'cockpit:view'), ('success_manager', 'audit:read'), ('success_manager', 'onboarding:manage'),
  ('success_manager', 'users:invite'),
  ('ai_specialist', 'leads:read'), ('ai_specialist', 'tenants:read'),
  ('ai_specialist', 'integrations:read'), ('ai_specialist', 'integrations:manage'),
  ('ai_specialist', 'cockpit:view'), ('ai_specialist', 'audit:read'), ('ai_specialist', 'onboarding:manage'),
  ('customer_admin', 'integrations:manage'), ('customer_admin', 'integrations:read'),
  ('customer_admin', 'cockpit:view'), ('customer_admin', 'onboarding:manage'),
  ('customer_admin', 'users:invite'), ('customer_admin', 'approvals:decide'),
  ('customer_user', 'integrations:read'), ('customer_user', 'cockpit:view'), ('customer_user', 'approvals:decide')
) AS r(role, permission)
JOIN public.permissions p ON p.name = r.permission;

-- Platform feature flag defaults. Unknown keys are off in code.
INSERT INTO public.feature_flags (key, description, is_enabled) VALUES
  ('cockpit.performance', 'Cockpit performance section', true),
  ('cockpit.leads', 'Cockpit leads section', true),
  ('module.brand', 'Brand studio module', false),
  ('connector.google-analytics', 'GA4 connector', false),
  ('connector.google-ads', 'Google Ads connector', false),
  ('connector.meta', 'Meta Ads connector', false),
  ('connector.hubspot', 'HubSpot connector', false),
  ('connector.linear', 'Linear connector', false),
  ('connector.notion', 'Notion connector', false)
ON CONFLICT (key) DO NOTHING;
