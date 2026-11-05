DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_api') THEN
    CREATE ROLE app_api NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_api;
GRANT USAGE ON SCHEMA app TO app_api;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants',
    'workspaces',
    'tenant_memberships',
    'staff_assignments',
    'connections',
    'credential_references',
    'data_scopes',
    'data_health',
    'onboarding_projects',
    'onboarding_checklist_items',
    'invitations',
    'feature_flag_overrides',
    'profiles',
    'leads',
    'lead_briefs',
    'lead_sources',
    'success_manager_notes',
    'opportunities',
    'audit_events',
    'outbox_events',
    'permissions',
    'role_permissions',
    'connectors',
    'feature_flags'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO app_api', t);
    END IF;
  END LOOP;
END
$$;

DROP POLICY IF EXISTS workspaces_tenant_isolation ON public.workspaces;
CREATE POLICY workspaces_tenant_isolation ON public.workspaces
  FOR ALL TO app_api
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS connections_tenant_isolation ON public.connections;
CREATE POLICY connections_tenant_isolation ON public.connections
  FOR ALL TO app_api
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS leads_staff_only ON public.leads;
CREATE POLICY leads_staff_only ON public.leads
  FOR ALL TO app_api
  USING (app.is_staff())
  WITH CHECK (app.is_staff());

DROP TRIGGER IF EXISTS audit_events_immutable ON public.audit_events;
CREATE TRIGGER audit_events_immutable
  BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION app.prevent_audit_mutation();
REVOKE UPDATE, DELETE ON TABLE public.audit_events FROM app_api;
GRANT SELECT, INSERT ON TABLE public.audit_events TO app_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_api;
