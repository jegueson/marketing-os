-- Generic REST read connector catalog + flag (ADR-0027).

insert into public.connectors (slug, name, description, category, auth_type, status, supported_scopes)
values (
  'rest',
  'Generic REST',
  'Read-only HTTPS GET metrics from a customer endpoint',
  'custom',
  'api_key',
  'active',
  '["metrics"]'::jsonb
)
on conflict (slug) do nothing;

insert into public.feature_flags (key, is_enabled, description)
values (
  'connector.rest',
  false,
  'Generic REST read connector (HTTPS GET only)'
)
on conflict (key) do nothing;
