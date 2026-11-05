-- Fails (non-zero exit with ON_ERROR_STOP) when any public table lacks forced RLS,
-- when anon/authenticated hold table privileges, or when app_api can bypass RLS.
DO $$
DECLARE
  offenders text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO offenders
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND NOT (c.relrowsecurity AND c.relforcerowsecurity);
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'Tables without forced RLS: %', offenders;
  END IF;

  SELECT string_agg(DISTINCT table_name || ':' || grantee, ', ') INTO offenders
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'anon/authenticated hold privileges on: %', offenders;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_api' AND (rolbypassrls OR rolsuper)) THEN
    RAISE EXCEPTION 'app_api must not bypass RLS';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    RAISE EXCEPTION 'vector and pgcrypto extensions are required';
  END IF;

  RAISE NOTICE 'RLS check passed';
END
$$;
