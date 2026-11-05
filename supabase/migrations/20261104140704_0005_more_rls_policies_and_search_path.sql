CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(current_setting('app.staff', true), '') = 'on';
$$;

CREATE OR REPLACE FUNCTION app.prevent_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are immutable';
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenant_memberships',
    'staff_assignments',
    'credential_references',
    'data_scopes',
    'data_health',
    'onboarding_projects',
    'onboarding_checklist_items',
    'invitations',
    'feature_flag_overrides'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO app_api USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id())',
      t || '_tenant_isolation',
      t
    );
  END LOOP;
END
$$;

DROP POLICY IF EXISTS tenants_staff_or_member ON public.tenants;
CREATE POLICY tenants_staff_or_member ON public.tenants
  FOR ALL TO app_api
  USING (app.is_staff() OR id = app.current_tenant_id())
  WITH CHECK (app.is_staff() OR id = app.current_tenant_id());

DROP POLICY IF EXISTS profiles_authenticated_access ON public.profiles;
CREATE POLICY profiles_authenticated_access ON public.profiles
  FOR ALL TO app_api
  USING (app.is_staff() OR id = app.current_user_id())
  WITH CHECK (app.is_staff() OR id = app.current_user_id());

DROP POLICY IF EXISTS staff_tables_staff_only ON public.lead_briefs;
CREATE POLICY staff_tables_staff_only ON public.lead_briefs FOR ALL TO app_api USING (app.is_staff()) WITH CHECK (app.is_staff());
DROP POLICY IF EXISTS staff_tables_staff_only ON public.lead_sources;
CREATE POLICY staff_tables_staff_only ON public.lead_sources FOR ALL TO app_api USING (app.is_staff()) WITH CHECK (app.is_staff());
DROP POLICY IF EXISTS staff_tables_staff_only ON public.success_manager_notes;
CREATE POLICY staff_tables_staff_only ON public.success_manager_notes FOR ALL TO app_api USING (app.is_staff()) WITH CHECK (app.is_staff());
DROP POLICY IF EXISTS staff_tables_staff_only ON public.opportunities;
CREATE POLICY staff_tables_staff_only ON public.opportunities FOR ALL TO app_api USING (app.is_staff()) WITH CHECK (app.is_staff());

DROP POLICY IF EXISTS audit_staff_or_tenant ON public.audit_events;
CREATE POLICY audit_staff_or_tenant ON public.audit_events
  FOR SELECT TO app_api
  USING (app.is_staff() OR tenant_id = app.current_tenant_id());
CREATE POLICY audit_insert ON public.audit_events
  FOR INSERT TO app_api
  WITH CHECK (true);

DROP POLICY IF EXISTS outbox_staff_or_tenant ON public.outbox_events;
CREATE POLICY outbox_staff_or_tenant ON public.outbox_events
  FOR ALL TO app_api
  USING (app.is_staff() OR tenant_id = app.current_tenant_id() OR tenant_id IS NULL)
  WITH CHECK (app.is_staff() OR tenant_id = app.current_tenant_id() OR tenant_id IS NULL);

DROP POLICY IF EXISTS catalog_read ON public.connectors;
CREATE POLICY catalog_read ON public.connectors FOR SELECT TO app_api USING (true);
DROP POLICY IF EXISTS catalog_write_staff ON public.connectors;
CREATE POLICY catalog_write_staff ON public.connectors FOR ALL TO app_api USING (app.is_staff()) WITH CHECK (app.is_staff());

DROP POLICY IF EXISTS permissions_read ON public.permissions;
CREATE POLICY permissions_read ON public.permissions FOR SELECT TO app_api USING (true);
DROP POLICY IF EXISTS role_permissions_read ON public.role_permissions;
CREATE POLICY role_permissions_read ON public.role_permissions FOR SELECT TO app_api USING (true);
DROP POLICY IF EXISTS feature_flags_read ON public.feature_flags;
CREATE POLICY feature_flags_read ON public.feature_flags FOR SELECT TO app_api USING (true);
