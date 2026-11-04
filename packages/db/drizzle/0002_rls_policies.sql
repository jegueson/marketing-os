-- Application role without BYPASSRLS. Used via Hyperdrive.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_api') THEN
    CREATE ROLE app_api NOINHERIT;
  END IF;
END
$$;

ALTER ROLE app_api NOSUPERUSER NOBYPASSRLS;

-- Tenant tables: enable RLS + default deny + tenant match.
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
    'onboarding_checklists',
    'onboarding_checklist_items',
    'invitations'
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

-- Profiles are user-scoped; still revoke PostgREST roles.
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO app_api;
  END IF;
END
$$;

-- Platform-scoped staff tables (leads): RLS on, staff-only via app.is_staff().
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads', 'lead_notes', 'lead_discovery', 'audit_events', 'outbox_events']
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
      EXECUTE format('GRANT SELECT, INSERT ON TABLE public.%I TO app_api', t);
    END IF;
  END LOOP;
END
$$;

-- Example tenant policy for workspaces when the table exists.
DO $$
BEGIN
  IF to_regclass('public.workspaces') IS NOT NULL THEN
    DROP POLICY IF EXISTS workspaces_tenant_isolation ON public.workspaces;
    CREATE POLICY workspaces_tenant_isolation ON public.workspaces
      FOR ALL
      TO app_api
      USING (tenant_id = app.current_tenant_id())
      WITH CHECK (tenant_id = app.current_tenant_id());
  END IF;
END
$$;

-- Audit immutability trigger helper attachment (table created by drizzle migrate).
DO $$
BEGIN
  IF to_regclass('public.audit_events') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS audit_events_immutable ON public.audit_events;
    CREATE TRIGGER audit_events_immutable
      BEFORE UPDATE OR DELETE ON public.audit_events
      FOR EACH ROW EXECUTE FUNCTION app.prevent_audit_mutation();
    REVOKE UPDATE, DELETE ON TABLE public.audit_events FROM app_api;
  END IF;
END
$$;
