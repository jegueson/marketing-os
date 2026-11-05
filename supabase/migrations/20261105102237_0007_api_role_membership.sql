-- The API connects as a login role and runs `SET LOCAL ROLE app_api` in every
-- transaction. Supabase's `postgres` is not a superuser, so it needs explicit
-- membership. `mos_hyperdrive` (the staging Hyperdrive login, created by hand)
-- gets it too when present. NOINHERIT on app_api keeps its grants inactive
-- until the role is switched.
GRANT app_api TO postgres;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mos_hyperdrive') THEN
    GRANT app_api TO mos_hyperdrive;
  END IF;
END $$;
